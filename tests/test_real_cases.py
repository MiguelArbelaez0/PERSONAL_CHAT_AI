"""Regressions for the four manual reports; every message here is synthetic."""
import json

import pytest

from backend.grounding import review_rejection, substantive_draft
from backend.lm_studio import LMStudioError
from backend.prompt import build_translation_review_messages
from backend.translation import TranslationRetries, translate_and_review
from backend.validation import response_rejection
from test_app import FakeLLM, build, completion, request
from test_translation import TranslationClient, run


EN = "Hey daddy, how are you today?"
MISSED = "I missed talking to you."
FR = "Bonsoir, tu vas bien ? J'aimerais apprendre à mieux te connaître."
PT = "Oi, tudo bem com você? Gostaria de te conhecer melhor."


class SequenceLLM(FakeLLM):
    def __init__(self, drafts):
        super().__init__()
        self.drafts = iter(drafts)
        self.calls = 0
        self.prompts = []

    async def chat(self, messages, count):
        self.calls += 1
        self.prompts.append(messages)
        return [completion([next(self.drafts)])]


def test_case1_completed_conversation_is_not_inferred_from_a_greeting(tmp_path):
    llm = SequenceLLM(["I'm great! Just had a lovely chat with you. How about you?", "I'm doing well, thanks for checking in."])
    response = request(build(tmp_path, llm), "POST", "/api/suggestions", json={"message": EN, "interlocutor": "Synthetic"})
    assert response.status_code == 200
    assert response.json()["original_response"] == "I'm doing well, thanks for checking in."
    assert llm.calls == 2
    assert "Borrador rechazado" in llm.prompts[1][-1]["content"]


def test_case1_persistent_invention_is_hidden_even_when_author_checks_pass(tmp_path):
    llm = SequenceLLM(["Just had a lovely chat and I'm feeling great."] * 2)
    response = request(build(tmp_path, llm), "POST", "/api/suggestions", json={"message": EN})
    assert response.status_code == 502
    assert "original_response" not in response.json()


def test_incoming_role_salutation_cannot_be_assigned_to_the_other_person():
    assert response_rejection("Hey daddy, I'm doing well thanks.", EN, "en") == "perspective_mismatch"
    assert response_rejection("I'm doing well, thanks for asking.", EN, "en") == ""


def test_case2_partial_phrase_repetition_is_corrected_across_requests(tmp_path):
    llm = SequenceLLM([
        "I'm well, just had a lovely chat with Sam.",
        "Just had a lovely chat and I'm glad you're here. What are you up to?",
        "It's good to hear from you again.",
    ])
    app = build(tmp_path, llm)
    common = {"interlocutor": "Synthetic", "context": "- Usuario: I just had a lovely chat with Sam."}
    first = request(app, "POST", "/api/suggestions", json={**common, "message": EN})
    assert first.status_code == 200
    second = request(app, "POST", "/api/suggestions", json={**common, "message": MISSED})
    assert second.status_code == 200
    assert second.json()["original_response"] == "It's good to hear from you again."
    assert llm.calls == 3
    assert "Borradores previos no enviados" in llm.prompts[-1][1]["content"]
    assert not app.state.memory.list_notes("Synthetic")


@pytest.mark.parametrize("draft", [PT, PT + " Estou feliz por você estar aqui, obrigado pelo carinho!", "Oi, tudo bem com você? Fico feliz por você estar aqui."])
def test_case4_whole_or_partial_incoming_copy_is_rejected(draft):
    assert response_rejection(draft, PT, "pt") in {"repeated_response", "copied_incoming"}


def test_case4_portuguese_echo_is_retried_without_changing_target(tmp_path):
    llm = SequenceLLM([PT + " Fico feliz por você estar aqui!", "Estou bem, obrigado! Fico feliz por você estar aqui."])
    result = request(build(tmp_path, llm), "POST", "/api/suggestions", json={"message": PT, "interlocutor": "Synthetic"})
    assert result.status_code == 200
    assert result.json()["language"] == "pt"
    assert PT not in result.json()["original_response"]
    assert all(PT in prompt[1]["content"] for prompt in llm.prompts)


def test_repeated_generic_questions_are_rejected_but_specific_questions_are_allowed():
    previous = ("I'm glad you're here. How about you?",)
    assert response_rejection("That sounds great. What are you up to?", MISSED, "en", previous) == "repetitive_question"
    assert response_rejection("Which film did you mean?", "I saw a movie.", "en", previous) == ""


@pytest.mark.parametrize("failure", ["supported", "perspective_consistent", "answers_target", "repeated_idea"])
def test_independent_review_can_reject_author_self_approval(tmp_path, failure):
    class Reviewed(SequenceLLM):
        async def review_generation(self, messages):
            data = json.loads(messages[1]["content"])
            assert data["target_incoming"] == MISSED
            assert "visible_history" in data
            verdict = {"supported": True, "perspective_consistent": True, "answers_target": True, "repeated_idea": False, "repetitive_question": False, "personal_claims": []}
            verdict[failure] = failure == "repeated_idea"
            return [json.dumps(verdict)]

    llm = Reviewed(["You made me smile, thanks for that."] * 2)
    response = request(build(tmp_path, llm), "POST", "/api/suggestions", json={"message": MISSED})
    assert response.status_code == 502
    assert llm.calls == 2


def test_independent_review_is_fail_closed_for_malformed_or_unavailable_review(tmp_path):
    assert review_rejection(['{"supported": true}']) == "invalid_grounding_review"

    class Unavailable(SequenceLLM):
        async def review_generation(self, messages):
            raise LMStudioError("LM Studio no responde.")

    result = request(build(tmp_path, Unavailable(["I'm doing well, thank you."])), "POST", "/api/suggestions", json={"message": EN})
    assert result.status_code == 503


@pytest.mark.parametrize("draft", ["I'm doing great, just lounging around.", "I've been thinking about you too, hope you're well!", "I missed you too, I'm happy you're here.", "I'm doing great, just enjoying a quiet morning.", "I'm well, just enjoying a nice day."])
def test_concrete_present_activities_and_reciprocity_need_owner_evidence(draft):
    assert response_rejection(draft, MISSED, "en") == "unsupported_claim"
    assert response_rejection(draft, MISSED, "en", context="- Usuario: " + draft) == ""


def test_grounding_review_checks_quotes_against_real_sources():
    verdict = {"supported": True, "perspective_consistent": True, "answers_target": True,
               "repeated_idea": False, "repetitive_question": False,
               "personal_claims": [{"claim": "Owner is working", "source": "history", "evidence_quote": "I am working"}]}
    assert review_rejection([json.dumps(verdict)], evidence={"history": "- Usuario: I am working"}) == ""
    assert review_rejection([json.dumps(verdict)], evidence={"history": "- Usuario: Hello"}) == "unsupported_claim"
    verdict["personal_claims"][0]["source"] = "previous_drafts"
    assert review_rejection([json.dumps(verdict)], evidence={"history": "- Usuario: Hello"}) == "invalid_grounding_review"


def test_malformed_auditor_output_is_repaired_before_regenerating_a_valid_draft(tmp_path):
    class Reviewed(SequenceLLM):
        reviews = 0

        async def review_generation(self, messages):
            self.reviews += 1
            if self.reviews == 1:
                return ['{"supported":true}']
            return [json.dumps({"supported": True, "perspective_consistent": True, "answers_target": True,
                                "repeated_idea": False, "repetitive_question": False, "personal_claims": []})]

    llm = Reviewed(["I'm doing well, thanks for asking."])
    result = request(build(tmp_path, llm), "POST", "/api/suggestions", json={"message": EN})
    assert result.status_code == 200
    assert llm.calls == 1 and llm.reviews == 2


@pytest.mark.parametrize("original,translation,language", [
    ("Bonsoir ! Je vais bien, merci. Ça me fait plaisir de te lire.", "¡Buenas noches! Estoy bien, gracias. Me alegra leerte.", "français"),
    ("Estou bem, obrigado! Fico feliz por você estar aqui.", "¡Estoy bien, gracias! Me alegra que estés aquí.", "português"),
])
def test_faithful_french_and_portuguese_translations_are_accepted(original, translation, language):
    client = TranslationClient([json.dumps({"translation": translation}, ensure_ascii=False)])
    result = run(translate_and_review(client, original=original, language=language))
    assert result.text == translation
    prompt = build_translation_review_messages(original=original, translation=translation, language=language)[0]["content"]
    assert "no correspondencia palabra por palabra" in prompt
    assert "partícula añadida o duda" not in prompt


def test_semantic_issue_is_fed_back_to_translation_repair():
    issue = {"category": "omission", "source_quote": "ce soir", "translation_quote": ""}

    class Repairing(TranslationClient):
        async def translate(self, messages):
            self.messages.append(messages)
            self.translate_calls += 1
            return [json.dumps({"translation": "Estoy bien." if self.translate_calls == 1 else "Estoy bien esta noche."})]

        async def review_translation(self, messages):
            self.review_calls += 1
            ok = self.review_calls == 2
            return [json.dumps({"meaning_preserved": ok, "no_added_or_omitted_information": ok,
                                "translation_is_spanish": True, "issues": [] if ok else [issue]})]

    client = Repairing([])
    result = run(translate_and_review(client, original="Je vais bien ce soir.", language="fr"))
    assert result.text == "Estoy bien esta noche."
    assert '"source_quote": "ce soir"' in client.messages[1][1]["content"]
    assert '"rejected_translation": "Estoy bien."' in client.messages[1][1]["content"]


def test_bad_translation_is_not_accepted_with_contradictory_positive_flags():
    client = TranslationClient([json.dumps({"translation": "No estoy bien."})], reviewed=[json.dumps({
        "meaning_preserved": True, "no_added_or_omitted_information": True, "translation_is_spanish": True,
        "issues": [{"category": "negation", "source_quote": "vais bien", "translation_quote": "No estoy bien"}],
    })])
    result = run(translate_and_review(client, original="Je vais bien.", language="fr"))
    assert result.text is None
    assert result.failure_reason == "fidelity_review_failed"


def test_portuguese_declarative_greeting_repair_still_requires_semantic_review():
    client = TranslationClient([json.dumps({"translation": "¡Hola! ¿Todo bien? Gracias por preguntar."})])
    result = run(translate_and_review(client, original="Oi! Tudo bem, obrigado por perguntar.", language="pt"))
    assert result.text == "¡Hola! Todo bien. Gracias por preguntar."
    assert client.review_calls == 1
    rejecting = TranslationClient(client.translated, reviewed=[json.dumps({"meaning_preserved": False, "no_added_or_omitted_information": False})])
    assert run(translate_and_review(rejecting, original="Oi! Tudo bem, obrigado por perguntar.", language="pt")).text is None


def test_portuguese_affirmation_is_preserved_when_another_clause_has_a_question():
    client = TranslationClient([json.dumps({"translation": "¡Hola! ¿Todo bien? Gracias por preguntar. ¿Cómo estás?"})])
    result = run(translate_and_review(client, original="Oi! Tudo bem, obrigado por perguntar. Como vai você?", language="pt"))
    assert result.text == "¡Hola! Todo bien. Gracias por preguntar. ¿Cómo estás?"


def test_extra_question_in_translation_is_rejected_even_if_original_contains_one():
    client = TranslationClient([json.dumps({"translation": "¡Buenas noches! Estoy bien. ¿Y tú? ¿Qué te gusta?"})])
    result = run(translate_and_review(client, original="Bonsoir ! Je vais bien. Et toi ?", language="fr"))
    assert result.text is None and result.failure_reason == "added_question"


def test_translation_retry_endpoint_uses_failed_candidate_and_preserves_original(tmp_path):
    class Retrying(FakeLLM):
        repair = False

        async def chat(self, messages, count):
            return [completion(["Bonsoir ! Je vais bien, merci. Ça me fait plaisir de te lire."])]

        async def translate(self, messages):
            self.last_translation_messages = messages
            return [json.dumps({"translation": "Buenas noches. Estoy bien." if not self.repair else "¡Buenas noches! Estoy bien, gracias. Me alegra leerte."})]

        async def review_translation(self, messages):
            return [json.dumps({"meaning_preserved": self.repair, "no_added_or_omitted_information": self.repair,
                                "translation_is_spanish": True, "issues": [] if self.repair else [
                                    {"category": "omission", "source_quote": "merci", "translation_quote": ""}]})]

    llm = Retrying()
    app = build(tmp_path, llm)
    body = request(app, "POST", "/api/suggestions", json={"message": FR}).json()
    assert body["original_response"].startswith("Bonsoir")
    assert body["spanish_translation"] is None
    token = body["diagnostics"]["translation_retry_token"]
    assert token and body["diagnostics"]["translation_attempts"] == 2
    payload = {"original_response": body["original_response"], "language": "fr", "retry_token": token}
    failed = request(app, "POST", "/api/translation/retry", json=payload).json()
    assert failed["available"] is False and failed["attempts"] == 2
    assert failed["failure_stage"] == "review"
    llm.repair = True
    payload["retry_token"] = failed["retry_token"]
    recovered = request(app, "POST", "/api/translation/retry", json=payload).json()
    assert recovered["available"] is True and recovered["attempts"] == 1
    assert '"rejected_translation": "Buenas noches. Estoy bien."' in llm.last_translation_messages[1]["content"]
    assert '"source_quote": "merci"' in llm.last_translation_messages[1]["content"]
    assert "Reintento" in llm.last_translation_messages[0]["content"]
    assert "original_response" not in recovered


def test_translation_repair_cache_is_bounded_expires_and_never_crosses_originals(monkeypatch):
    now = [0]
    monkeypatch.setattr("backend.translation.time.monotonic", lambda: now[0])
    cache = TranslationRetries(limit=2, ttl=10)
    token = cache.save("source", "français", {"candidate": "texto"})
    assert cache.take(token, "different", "fr") is None
    assert cache.take(token, "source", "pt") is None
    assert cache.take(token, "source", "fr") == {"candidate": "texto"}
    assert cache.take(token, "source", "fr") is None
    old = cache.save("source", "fr", {})
    cache.save("other", "fr", {})
    cache.save("third", "fr", {})
    assert cache.take(old, "source", "fr") is None
    now[0] = 11
    cache.save("latest", "fr", {})
    assert len(cache.entries) == 1


def test_evening_greeting_and_question_punctuation_are_repaired_before_review():
    client = TranslationClient([json.dumps({"translation": "¡Buenas tardes! Estoy bien. ¡Cómo estás tú?"})])
    result = run(translate_and_review(client, original="Bonsoir ! Je vais bien. Comment vas-tu ?", language="fr"))
    assert result.text == "¡Buenas noches! Estoy bien. ¿Cómo estás tú?"
    assert client.review_calls == 1


def test_omitted_evening_greeting_is_rejected_even_if_model_would_approve():
    client = TranslationClient([json.dumps({"translation": "Estoy bien, gracias."})])
    result = run(translate_and_review(client, original="Bonsoir ! Je vais bien, merci.", language="fr"))
    assert result.text is None and result.failure_reason == "greeting_mismatch"
    assert client.review_calls == 0


def test_lm_client_requests_structured_outputs_and_falls_back_once_for_legacy_server(monkeypatch):
    import httpx
    from backend.lm_studio import LMStudioClient

    class Client:
        payloads = []

        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass

        async def post(self, url, json):
            self.payloads.append(json)
            if len(self.payloads) == 1:
                return httpx.Response(400, request=httpx.Request("POST", url))
            return httpx.Response(200, request=httpx.Request("POST", url), json={
                "choices": [{"message": {"content": '{"responses":["Hello"],"checks":[]}'}, "finish_reason": "stop"}]})

    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", Client)
    client = LMStudioClient("http://127.0.0.1:1234/v1", "test-model")
    run(client.chat([], 1))
    schema = Client.payloads[0]["response_format"]["json_schema"]["schema"]
    assert schema["properties"]["responses"]["maxItems"] == 1
    assert "response_format" not in Client.payloads[1]
    run(client.chat([], 1))
    assert len(Client.payloads) == 3 and "response_format" not in Client.payloads[2]


def test_conventional_courtesies_do_not_require_event_evidence_but_activities_stay_in_audit():
    assert substantive_draft("Bonsoir ! Je vais bien, merci, et oui, je serais ravi de mieux te connaître.") == ""
    assert "watching TV" in substantive_draft("I'm doing well, thanks! I'm watching TV.")
    assert "I missed you too" in substantive_draft("Hi! I missed you too.")
    assert "I had a lovely chat" in substantive_draft("Hello! I had a lovely chat with you.")
    assert "good at playing" in substantive_draft("I'm good at playing the guitar.")


def test_recalling_a_manual_fact_is_not_confused_with_inventing_a_completed_event():
    assert response_rejection("I remember you like blue.", "What color do I like?", "en", notes=[{"text": "Likes blue"}]) == ""
