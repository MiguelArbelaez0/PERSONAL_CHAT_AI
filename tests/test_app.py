import json
import asyncio
import re
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from backend.config import Settings
from backend.knowledge import read_knowledge
from backend.lm_studio import LMStudioClient, LMStudioError
from backend.main import create_app
from backend.memory import MemoryStore
from backend.schemas import SuggestRequest, TranslationRequest


def completion(responses, *, analysis=None, checks=None):
    return json.dumps({
        "analysis": analysis or {
            "current_topic": "reply to the latest incoming message",
            "message_meaning": "the literal meaning available in the target and visible history",
            "likely_intent": "continue the current topic without assuming missing details",
            "intent_confidence": 0.6,
            "references": [], "observed_tone": "conversational", "active_topics": [],
            "relevant_memory": [], "explicit_facts": [], "inferences": [], "unknowns": [],
            "money_or_tip_relevant": False, "adult_or_domination_supported": False,
        },
        "responses": responses[:1],
        "checks": (checks or [
            {"on_topic": True, "correct_language": True, "unrequested_money": False,
             "perspective_consistent": True, "unsupported_adult_or_domination": False, "unsupported_claim": False}
            for _ in range(2)
        ])[:1],
    }, ensure_ascii=False)


class FakeLLM:
    def __init__(self):
        self.last_messages = None
        self.last_count = None
        self.last_analysis_messages = None
        self.last_translation_messages = None
        self.last_translation_review_messages = None
        self.translation_calls = 0
        self.translation_review_calls = 0

    async def models(self):
        return ["local-model"]

    async def analyze(self, messages):
        self.last_analysis_messages = messages
        return [json.dumps({"analysis": {
            "current_topic": "latest incoming message",
            "message_meaning": "literal content with available history",
            "likely_intent": "continue the current conversation cautiously",
            "intent_confidence": 0.6, "references": [], "observed_tone": "conversational",
            "active_topics": [], "relevant_memory": [], "explicit_facts": [], "inferences": [],
            "unknowns": ["details not present in visible history"],
            "money_or_tip_relevant": False, "adult_or_domination_supported": False,
        }}, ensure_ascii=False)]

    async def chat(self, messages, count):
        self.last_messages = messages
        self.last_count = count
        assert "datos no confiables" in messages[0]["content"]
        assert count == 1
        assert "analisis_contextual_previo_no_confiable" in messages[1]["content"]
        language = re.search(r"RESPONSE_LANGUAGE: ([^\r\n]+)", messages[0]["content"]).group(1)
        answers = {
            "English": ["That sounds lovely, I would be happy to hear more."],
            "español": ["Me alegra mucho verte, cuéntame más."],
            "français": ["Ça me fait plaisir de te lire, raconte-moi davantage."],
            "português": ["Fico feliz por você estar aqui, conta-me más."],
            "Deutsch": ["Das klingt toll, ich freue mich darauf."],
            "italiano": ["Che bello rivederti, mi fa piacere."],
        }
        return [completion(answers[language])]

    async def translate(self, messages):
        self.last_translation_messages = messages
        self.translation_calls += 1
        return [json.dumps({"translation": "Me alegra leerte, cuéntame más.", "faithful": True, "adds_or_omits_information": False}, ensure_ascii=False)]

    async def review_translation(self, messages):
        self.last_translation_review_messages = messages
        self.translation_review_calls += 1
        return [json.dumps({"meaning_preserved": True, "no_added_or_omitted_information": True, "translation_is_spanish": True})]


def build(tmp_path, llm=None):
    cfg = Settings(database_path=tmp_path / "memory.sqlite3", knowledge_path=tmp_path / "knowledge")
    return create_app(cfg, llm=llm or FakeLLM())


def run_immediate_coroutine(coroutine):
    """Drive mocked, non-blocking async clients without opening an OS event loop."""
    with pytest.raises(StopIteration) as completed:
        coroutine.send(None)
    return completed.value.value


def request(app, method, path, **kwargs):
    async def run():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(run())


def test_health_and_lm_diagnostics(tmp_path):
    app = build(tmp_path)
    assert request(app, "GET", "/api/health").json()["status"] == "ok"
    assert request(app, "GET", "/api/diagnostics/lm-studio").json()["available"] is True


def test_suggestions_and_alias_empty(tmp_path):
    app = build(tmp_path)
    response = request(app, "POST", "/api/suggestions", json={"message": "Hola", "count": 1, "conversation_id": "chat-test-1"})
    assert response.status_code == 200
    assert response.json()["original_response"]
    assert response.json()["language"] == "es"
    assert response.json()["spanish_translation"] is None
    assert response.json()["interlocutor"] is None
    assert response.json()["memory_available"] is False
    assert response.json()["api_version"] == "1.0"
    assert response.json()["conversation_id"] == "chat-test-1"


def test_suggestion_request_accepts_canonical_and_legacy_contract_fields():
    canonical = SuggestRequest.model_validate({
        "target_message": "😏😉", "target_message_id": "msg-2", "conversation_id": "chat-a",
        "interlocutor_alias": "Ana", "conversation_history": "- Interlocutor: hi", "detected_language": "en",
    })
    assert canonical.message == canonical.target_message == "😏😉"
    assert canonical.context == canonical.conversation_history == "- Interlocutor: hi"
    assert canonical.interlocutor == canonical.interlocutor_alias == "Ana"
    legacy = SuggestRequest.model_validate({"message": "Hello", "context": "Earlier", "interlocutor": "Sam"})
    assert legacy.target_message == legacy.message == "Hello"
    assert legacy.conversation_history == legacy.context == "Earlier"
    assert legacy.interlocutor_alias == legacy.interlocutor == "Sam"


def test_suggestion_response_echoes_target_identity_for_stale_response_guard(tmp_path):
    app = build(tmp_path)
    response = request(app, "POST", "/api/suggestions", json={
        "target_message": "Hola", "target_message_id": "msg-9", "conversation_id": "chat-a",
        "interlocutor_alias": "Ana", "conversation_history": "- Usuario: Hi",
    })
    assert response.status_code == 200
    assert response.json()["conversation_id"] == "chat-a"
    assert response.json()["target_message_id"] == "msg-9"
    assert response.json()["generation_id"]
    assert response.json()["diagnostics"]["translation_status"] == "not_needed"


def test_structured_validation_error_contract_never_returns_object_detail(tmp_path):
    response = request(build(tmp_path), "POST", "/api/suggestions", json={"message": ""})
    assert response.status_code == 422
    body = response.json()
    assert body["api_version"] == "1.0"
    assert body["error"]["code"] == "invalid_request"
    assert isinstance(body["error"]["message"], str)
    assert body["detail"] == body["error"]["message"]
    assert "[object Object]" not in body["detail"]
    assert body["diagnostics"]["issues"][0]["path"] == ["body", "message"]
    assert "input" not in body["diagnostics"]["issues"][0]

    malformed = request(build(tmp_path), "POST", "/api/suggestions", content="{", headers={"content-type": "application/json"})
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "invalid_json"


def test_real_generation_path_sends_profile_style_examples_and_safe_diagnostics_to_llm(tmp_path):
    llm = FakeLLM()
    app = build(tmp_path, llm)
    local = tmp_path / "knowledge" / "local"
    local.mkdir(parents=True)
    (local / "perfil.md").write_text(
        "# Perfil\n\n## Identidad\nPROFILE_INCLUDED_SENTINEL: confirmed user persona.", encoding="utf-8"
    )
    (local / "ejemplos_de_respuestas.md").write_text(
        "# Examples\n\n## Short replies\nViewer: EXAMPLE_INCLUDED_SENTINEL, keep it playful.\n"
        "Respuesta deseada: Keep it short and natural.", encoding="utf-8"
    )
    app.state.memory.add_note("Viewer-1", "MEMORY_INCLUDED_SENTINEL")
    endpoint = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/api/suggestions")

    coroutine = endpoint(SuggestRequest(
        message="I want to see you tonight", interlocutor="Viewer-1",
        language="es",
        context="- Interlocutor (10:00): I like your style\n- Usuario (10:01): Thanks",
    ))
    try:
        coroutine.send(None)
    except StopIteration as completed:
        result = completed.value
    else:
        pytest.fail("FakeLLM should complete without starting an event loop")

    assert llm.last_count == 1
    assert "PROFILE_INCLUDED_SENTINEL" in llm.last_messages[1]["content"]
    assert "EXAMPLE_INCLUDED_SENTINEL" in llm.last_messages[1]["content"]
    assert "MEMORY_INCLUDED_SENTINEL" in llm.last_messages[1]["content"]
    assert all("PROFILE_INCLUDED_SENTINEL" not in item["content"] for item in llm.last_messages if item["role"] == "system")
    diag = result.diagnostics
    assert diag.detected_language == "en"
    assert diag.language_rule == "last_incoming_message"
    assert "RESPONSE_LANGUAGE: English" in llm.last_messages[0]["content"]
    assert "RESPONSE_LANGUAGE: English" in llm.last_messages[1]["content"]
    assert diag.knowledge_sources["perfil.md"].included_in_prompt is True
    assert diag.knowledge_sources["perfil.md"].loaded_from == "local_override"
    assert diag.memory_available is True
    assert diag.memory_note_count == 1
    assert diag.context_message_count == 2
    assert diag.context_input_message_count == 2
    assert diag.context_included_chars == len("- Interlocutor (10:00): I like your style\n- Usuario (10:01): Thanks")
    assert diag.dom_extracted_message_count == 0
    assert diag.last_incoming_found is True
    assert diag.context_sent is True
    assert diag.response_count == 1
    assert diag.response_language_codes == ["en"]
    assert result.original_response
    assert result.spanish_translation == "Me alegra leerte, cuéntame más."
    assert result.diagnostics.translation_status == "available"
    assert llm.last_translation_messages[1]["content"].endswith(result.original_response)
    assert llm.translation_review_calls == 1
    assert result.original_response in llm.last_translation_review_messages[1]["content"]
    assert diag.language_retry_used is False
    assert "PROFILE_INCLUDED_SENTINEL" not in str(diag)


def test_validation(tmp_path):
    app = build(tmp_path)
    assert request(app, "POST", "/api/suggestions", json={"message": ""}).status_code == 422
    assert request(app, "POST", "/api/suggestions", json={"message": "hola", "count": 0}).status_code == 422
    assert request(app, "POST", "/api/suggestions", json={"message": "hola", "count": 2}).status_code == 422
    assert request(app, "POST", "/api/suggestions", json={"message": "hola", "count": 9}).status_code == 422


def _direct_suggestions_endpoint(app, request_data):
    endpoint = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/api/suggestions")
    coroutine = endpoint(SuggestRequest(**request_data))
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    pytest.fail("Fake LLM should complete without starting an event loop")


@pytest.mark.parametrize(("message", "expected"), [
    ("I'm glad to hear that", "en"),
    ("¿Qué haces esta noche?", "es"),
    ("Comment vas-tu ce soir?", "fr"),
    ("Como você está hoje?", "pt"),
    ("Was machst du heute?", "de"),
    ("Che cosa vuoi stasera?", "it"),
])
def test_backend_returns_one_response_in_detected_language_even_if_request_language_differs(tmp_path, message, expected):
    result = _direct_suggestions_endpoint(
        build(tmp_path), {"message": message, "language": "es"},
    )
    assert result.original_response
    assert result.diagnostics.detected_language == expected
    assert result.diagnostics.response_language_codes == [expected]


def test_prompt_receives_recent_history_and_manual_context_in_order_without_losing_target(tmp_path):
    llm = FakeLLM()
    endpoint = next(route.endpoint for route in build(tmp_path, llm).routes if getattr(route, "path", None) == "/api/suggestions")
    context = "- Interlocutor (10:00): We could talk about the blue dress later.\n- Usuario (10:01): I remember.\n- Usuario (10:02): Are you still there?"
    coroutine = endpoint(SuggestRequest(
        message="Yes, the blue one 😊", interlocutor="Ana", context=context,
        additional_context="- Interlocutor (09:55): She mentioned the blue dress earlier.",
        dom_extracted_message_count=8, dom_extracted_incoming_count=4,
        dom_extracted_outgoing_count=3, dom_extracted_unclassified_count=1,
        client_context_window=8,
    ))
    with pytest.raises(StopIteration) as completed:
        coroutine.send(None)
    result = completed.value.value
    user_prompt = llm.last_messages[1]["content"]
    assert user_prompt.index("10:00") < user_prompt.index("10:01") < user_prompt.index("10:02")
    assert "OBJETIVO ACTUAL" in user_prompt
    assert '"text": "Yes, the blue one 😊"' in user_prompt
    assert "Yes, the blue one 😊" in user_prompt
    assert "09:55" in user_prompt
    assert result.diagnostics.dom_extracted_message_count == 8
    assert result.diagnostics.dom_extracted_incoming_count == 4
    assert result.diagnostics.dom_extracted_outgoing_count == 3
    assert result.diagnostics.dom_extracted_unclassified_count == 1
    assert "filas con dirección no clasificada" in result.diagnostics.context_truncation_reason


def test_pronoun_perspective_error_is_retried_and_corrected(tmp_path):
    class PerspectiveLLM(FakeLLM):
        def __init__(self):
            super().__init__()
            self.generation_outputs = [
                completion(["Yeah, you definitely made me laugh 😂"], checks=[{
                    "on_topic": True, "correct_language": True, "perspective_consistent": False,
                    "unrequested_money": False, "unsupported_adult_or_domination": False, "unsupported_claim": False,
                }]),
                completion(["I'm glad I made you laugh 😂"], checks=[{
                    "on_topic": True, "correct_language": True, "perspective_consistent": True,
                    "unrequested_money": False, "unsupported_adult_or_domination": False, "unsupported_claim": False,
                }]),
            ]
            self.generation_prompts = []

        async def chat(self, messages, count):
            self.generation_prompts.append(messages)
            if len(self.generation_prompts) <= 2:
                    return [self.generation_outputs.pop(0)]
            return await super().chat(messages, count)

    llm = PerspectiveLLM()
    result = _direct_suggestions_endpoint(build(tmp_path, llm), {
        "message": "That was funny haha, you really made me laugh 😂",
        "context": "- Interlocutor: That was funny haha, you really made me laugh 😂",
        "interlocutor": "Alex",
    })
    assert result.original_response == "I'm glad I made you laugh 😂"
    assert len(llm.generation_prompts) == 2
    assert "Reintento controlado" in llm.generation_prompts[1][-1]["content"]
    assert "redacta desde la perspectiva del usuario" in llm.generation_prompts[1][-1]["content"].casefold()


def test_model_context_budget_discards_oldest_dom_rows_and_reports_truncation(tmp_path):
    llm = FakeLLM()
    config = Settings(
        database_path=tmp_path / "memory.sqlite3", knowledge_path=tmp_path / "knowledge",
        lm_studio_context_tokens=8192, lm_studio_output_tokens=500, max_context_chars=20000,
    )
    app = create_app(config, llm=llm)
    endpoint = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/api/suggestions")
    context = "\n".join(
        f"- Interlocutor (10:{index:02d}): old-marker-{index} {'reference detail ' * 34}"
        for index in range(18)
    )
    coroutine = endpoint(SuggestRequest(
        message="Where are we now?", context=context,
        dom_extracted_message_count=18, dom_extracted_incoming_count=18,
    ))
    with pytest.raises(StopIteration) as completed:
        coroutine.send(None)
    result = completed.value.value
    user_prompt = llm.last_messages[1]["content"]
    assert "old-marker-0" not in user_prompt
    assert "old-marker-17" in user_prompt
    assert result.diagnostics.context_message_count < result.diagnostics.context_input_message_count
    assert "presupuesto estimado del modelo: historial DOM" in result.diagnostics.context_truncation_reason
    assert result.diagnostics.estimated_prompt_tokens <= 8192 - 500 - 128


def test_unstructured_answer_gets_one_controlled_retry_and_returns_one_response(tmp_path):
    class SequenceLLM(FakeLLM):
        def __init__(self):
            super().__init__()
            self.calls = 0

        async def chat(self, messages, count):
            self.calls += 1
            self.last_messages = messages
            if self.calls == 1:
                return ["1. Solo una respuesta"]
            return [completion(["Me alegra mucho leerte, cuéntame más.", "Otra opción, con un enfoque distinto."])]

    llm = SequenceLLM()
    result = _direct_suggestions_endpoint(build(tmp_path, llm), {"message": "Hola"})
    assert llm.calls == 2
    assert result.original_response == "Me alegra mucho leerte, cuéntame más."


def test_empty_model_output_gets_exactly_one_retry(tmp_path):
    class EmptyThenValid(FakeLLM):
        def __init__(self):
            super().__init__()
            self.calls = 0

        async def chat(self, messages, count):
            self.calls += 1
            return [] if self.calls == 1 else [completion(["Me alegra leerte.", "Qué gusto verte por aquí; cuéntame más."])]

    llm = EmptyThenValid()
    result = _direct_suggestions_endpoint(build(tmp_path, llm), {"message": "Hola"})
    assert llm.calls == 2
    assert result.original_response == "Me alegra leerte."


@pytest.mark.parametrize("explicit_promise", [False, True])
def test_suggestions_respect_available_evidence_and_do_not_write_generated_memory(tmp_path, explicit_promise):
    class EvidenceAwareLLM(FakeLLM):
        async def chat(self, messages, count):
            prompt = messages[1]["content"]
            assert "no demuestra que hubiera una promesa" in messages[0]["content"]
            assert "pide una pista" in messages[0]["content"]
            assert '"responses"' in messages[0]["content"]
            if explicit_promise:
                assert "I promised to tell you my favorite movie next time." in prompt
                return [completion(["I did say I would tell you my favorite movie next time; I do not see the title here, though.", "Right, I said I would share my favorite movie next time. Give me a moment to find the title."])]
            assert "I promised to tell you my favorite movie next time." not in prompt
            return [completion(["I cannot place it from the messages I can see—give me a little hint? 😉", "I do not want to guess and tell you the wrong thing. What were we talking about? 😏"])]

    llm = EvidenceAwareLLM()
    app = build(tmp_path, llm)
    app.state.memory.add_note("Viewer", "Likes playful teasing")
    before = app.state.memory.list_notes("Viewer")
    history = (
        "- Interlocutor (10:00): That blue outfit looks great.\n"
        "- Usuario (10:01): Thanks, you have good taste."
    )
    if explicit_promise:
        history += "\n- Usuario (10:02): I promised to tell you my favorite movie next time."
    result = _direct_suggestions_endpoint(app, {
        "message": "Haha maybe 😏 But you still owe me an answer from our last conversation. Do you remember what you promised me? 😉",
        "interlocutor": "Viewer", "context": history,
    })
    texts = [result.original_response]
    assert len(texts) == 1
    assert result.diagnostics.response_language_codes == ["en"]
    if explicit_promise:
        assert all("favorite movie next time" in text for text in texts)
    else:
        assert all(any(word in text.casefold() for word in ("hint", "guess", "messages")) for text in texts)
        assert all("i promised" not in text.casefold() for text in texts)
    assert app.state.memory.list_notes("Viewer") == before


@pytest.mark.parametrize(("message", "mentions_tokens"), [
    ("How has your day been? 😊", False),
    ("Did you see the 100 tokens I sent?", True),
])
def test_current_topic_controls_whether_token_history_is_used(tmp_path, message, mentions_tokens):
    class TopicAwareLLM(FakeLLM):
        async def chat(self, messages, count):
            prompt = messages[1]["content"]
            assert message in prompt
            assert "I sent 200 tokens for the show" in prompt
            if mentions_tokens:
                return [completion(["I saw the 100 tokens, thank you for that.", "Yes, I noticed your 100 tokens—thank you 😊"], analysis={
                    "current_topic": "tokens sent by the interlocutor", "message_meaning": "asks whether they were noticed",
                    "likely_intent": "acknowledgement", "intent_confidence": 0.9, "references": [],
                    "observed_tone": "casual", "active_topics": ["tokens"], "relevant_memory": [],
                    "explicit_facts": ["the interlocutor says they sent 100 tokens"], "inferences": [], "unknowns": [],
                    "money_or_tip_relevant": True, "adult_or_domination_supported": False,
                })]
            return [completion(["My day has been pretty good, thanks for asking 😊", "It has been a calm day so far. How about yours?"])]

    result = _direct_suggestions_endpoint(build(tmp_path, TopicAwareLLM()), {
        "message": message, "interlocutor": "Viewer",
        "context": "- Interlocutor (10:00): I sent 200 tokens for the show\n- Usuario (10:01): Thank you",
    })
    texts = [result.original_response.casefold()]
    assert len(texts) == 1
    assert all(("token" in text) == mentions_tokens for text in texts)


def test_french_adult_anecdote_does_not_trigger_tip_or_domination_and_uses_history(tmp_path):
    target = "oups désolée il m'a pris comme ça puis baisée"
    history = (
        "- Interlocutor (19:40): J'ai eu une journée compliquée au travail.\n"
        "- Usuario (19:41): Tu veux me raconter ce qui s'est passé ?"
    )

    class FrenchContextLLM(FakeLLM):
        async def chat(self, messages, count):
            prompt = messages[1]["content"]
            assert target in prompt and history.replace("\n", "\\n") in prompt
            assert "analisis_contextual_previo_no_confiable" in messages[1]["content"]
            assert "no demuestra que hubiera un malentendido" in messages[0]["content"].casefold()
            return [completion(
                ["Oh, tu n'as pas à t'excuser. Ça va, tu te sens comment après ?", "Ne t'excuse pas, raconte-moi si tu veux ce qui s'est passé."],
                analysis={
                    "current_topic": "elle raconte une expérience sexuelle et s'excuse",
                    "message_meaning": "elle dit qu'un homme l'a prise et pénétrée, puis s'excuse",
                    "likely_intent": "partager une anecdote; la raison de l'excuse reste incertaine",
                    "intent_confidence": 0.55, "references": ["il renvoie peut-être à une personne évoquée avant"],
                    "observed_tone": "confidentiel", "active_topics": ["journée compliquée", "ce qui s'est passé"],
                    "relevant_memory": [], "explicit_facts": ["elle s'excuse", "elle décrit un rapport sexuel"],
                    "inferences": ["elle pourrait chercher une réaction empathique"],
                    "unknowns": ["qui est il", "si la rencontre était désirée", "la raison de l'excuse"],
                    "money_or_tip_relevant": False, "adult_or_domination_supported": False,
                },
            )]

    llm = FrenchContextLLM()
    result = _direct_suggestions_endpoint(build(tmp_path, llm), {
        "message": target, "interlocutor": "carac2", "context": history,
    })
    replies = [result.original_response]
    assert len(replies) == 1
    assert result.diagnostics.response_language_codes == ["fr"]
    assert target in llm.last_analysis_messages[1]["content"]
    assert history in llm.last_analysis_messages[1]["content"]
    assert "money_or_tip_relevant" in llm.last_analysis_messages[0]["content"]
    assert all("tip" not in reply.casefold() and "token" not in reply.casefold() for reply in replies)


def test_contextual_review_retries_once_when_it_flags_unsolicited_money(tmp_path):
    class ReviewThenCorrect(FakeLLM):
        def __init__(self):
            super().__init__()
            self.calls = 0

        async def chat(self, messages, count):
            self.calls += 1
            if self.calls == 1:
                return [completion(
                    ["Keep tipping and I will tell you more.", "Every token gives me more control."],
                    checks=[
                        {"on_topic": True, "correct_language": True, "unrequested_money": True,
                         "perspective_consistent": True, "unsupported_adult_or_domination": False, "unsupported_claim": False},
                        {"on_topic": True, "correct_language": True, "unrequested_money": True,
                         "perspective_consistent": True, "unsupported_adult_or_domination": False, "unsupported_claim": False},
                    ],
                )]
            assert "unrequested_money" in messages[-1]["content"]
            return [completion(["That sounds like a lot to process; how are you feeling?", "You can tell me more if you feel comfortable."])]

    llm = ReviewThenCorrect()
    result = _direct_suggestions_endpoint(build(tmp_path, llm), {
        "message": "He did that and I don't know what to think.", "interlocutor": "Viewer",
    })
    assert llm.calls == 2
    assert result.original_response
    assert "tip" not in result.original_response.casefold() and "token" not in result.original_response.casefold()


def test_persistent_context_review_failure_returns_clear_error_after_one_retry(tmp_path):
    from fastapi import HTTPException

    class AlwaysUnsolicitedMoney(FakeLLM):
        def __init__(self):
            super().__init__()
            self.calls = 0

        async def chat(self, messages, count):
            self.calls += 1
            return [completion(
                ["Keep tipping for me.", "Send more tokens and I will obey."],
                checks=[
                    {"on_topic": True, "correct_language": True, "unrequested_money": True,
                     "perspective_consistent": True, "unsupported_adult_or_domination": False, "unsupported_claim": False},
                    {"on_topic": True, "correct_language": True, "unrequested_money": True,
                     "perspective_consistent": True, "unsupported_adult_or_domination": False, "unsupported_claim": False},
                ],
            )]

    llm = AlwaysUnsolicitedMoney()
    endpoint = next(route.endpoint for route in build(tmp_path, llm).routes if getattr(route, "path", None) == "/api/suggestions")
    with pytest.raises(HTTPException) as error:
        endpoint(SuggestRequest(message="How was your day?" )).send(None)
    assert llm.calls == 2
    assert error.value.status_code == 502
    assert "propinas o dinero no solicitados" in error.value.detail


def test_empty_generation_after_retry_is_an_error(tmp_path):
    from fastapi import HTTPException

    class RepeatingLLM(FakeLLM):
        async def chat(self, messages, count):
            self.calls = getattr(self, "calls", 0) + 1
            return []

    app = build(tmp_path, RepeatingLLM())
    endpoint = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/api/suggestions")
    coroutine = endpoint(SuggestRequest(message="Hola"))
    with pytest.raises(HTTPException) as error:
        coroutine.send(None)
    assert error.value.status_code == 502
    assert "respuesta vacía" in error.value.detail


def test_translation_failure_keeps_original_response_available(tmp_path):
    class TranslationFailure(FakeLLM):
        async def translate(self, messages):
            self.last_translation_messages = messages
            self.translation_calls += 1
            return []

    llm = TranslationFailure()
    result = _direct_suggestions_endpoint(build(tmp_path, llm), {"message": "I'm glad to hear that"})
    assert result.original_response == "That sounds lovely, I would be happy to hear more."
    assert result.spanish_translation is None
    assert "traducción al español no disponible" in result.notice
    assert llm.translation_calls == 2
    assert result.diagnostics.translation_failure_reason == "empty_response"
    assert result.diagnostics.translation_retry_available is True
    assert "No redactes una respuesta nueva" in llm.last_translation_messages[0]["content"]
    assert llm.last_translation_messages[1]["content"].endswith(result.original_response)


def test_unfaithful_or_non_spanish_translation_is_hidden_without_losing_original(tmp_path):
    class InvalidTranslation(FakeLLM):
        async def translate(self, messages):
            return [json.dumps({"translation": "Send me more tokens.", "faithful": False, "adds_or_omits_information": True})]

    result = _direct_suggestions_endpoint(build(tmp_path, InvalidTranslation()), {"message": "I'm glad to hear that"})
    assert result.original_response
    assert result.spanish_translation is None
    assert result.diagnostics.translation_failure_reason == "invalid_format"


def test_failed_semantic_translation_review_hides_translation_but_keeps_original(tmp_path):
    class FailedTranslationReview(FakeLLM):
        async def review_translation(self, messages):
            return [json.dumps({"meaning_preserved": False, "no_added_or_omitted_information": False})]

    result = _direct_suggestions_endpoint(build(tmp_path, FailedTranslationReview()), {"message": "I'm glad to hear that"})
    assert result.original_response
    assert result.spanish_translation is None
    assert "traducción al español no disponible" in result.notice


def test_spanish_source_skips_translation_request(tmp_path):
    llm = FakeLLM()
    result = _direct_suggestions_endpoint(build(tmp_path, llm), {"message": "¿Qué haces esta noche?"})
    assert result.language == "es"
    assert result.original_response
    assert result.spanish_translation is None
    assert llm.translation_calls == 0


def test_translation_retry_endpoint_preserves_original_and_recovers(tmp_path):
    class RecoveringTranslation(FakeLLM):
        async def translate(self, messages):
            self.translation_calls += 1
            self.last_translation_messages = messages
            if self.translation_calls < 3:
                return []
            return [json.dumps({"translation": "Me alegra que te hiciera reír.", "faithful": True, "adds_or_omits_information": False})]

    llm = RecoveringTranslation()
    app = build(tmp_path, llm)
    original = _direct_suggestions_endpoint(app, {"message": "I'm glad you laughed"})
    assert original.original_response
    assert original.spanish_translation is None
    endpoint = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/api/translation/retry")
    retried = run_immediate_coroutine(endpoint(TranslationRequest(original_response=original.original_response, language="English")))
    assert retried.available is True
    assert retried.spanish_translation == "Me alegra que te hiciera reír."
    assert llm.translation_calls == 3


def test_multiple_original_responses_are_rejected_after_one_retry(tmp_path):
    from fastapi import HTTPException

    checks = [{"on_topic": True, "correct_language": True, "perspective_consistent": True, "unrequested_money": False,
               "unsupported_adult_or_domination": False, "unsupported_claim": False}]

    class TwoResponses(FakeLLM):
        async def chat(self, messages, count):
            return [json.dumps({"responses": ["First response.", "Second alternative."], "checks": checks})]

    endpoint = next(route.endpoint for route in build(tmp_path, TwoResponses()).routes if getattr(route, "path", None) == "/api/suggestions")
    with pytest.raises(HTTPException) as error:
        endpoint(SuggestRequest(message="I'm glad to hear that")).send(None)
    assert error.value.status_code == 502
    assert "más de una respuesta original" in error.value.detail


def test_wrong_language_is_regenerated_once_and_only_correct_language_is_returned(tmp_path):
    class WrongThenEnglish(FakeLLM):
        def __init__(self):
            super().__init__()
            self.calls = 0

        async def chat(self, messages, count):
            self.calls += 1
            self.last_messages = messages
            self.last_count = count
            if self.calls == 1:
                return [completion(["Hola, me alegra mucho verte.", "Qué bonito tenerte aquí; cuéntame más."])]
            return [completion(["That sounds lovely; tell me more.", "I like your energy; what are you thinking?"])]

    llm = WrongThenEnglish()
    result = _direct_suggestions_endpoint(build(tmp_path, llm), {
        "message": "I'm glad to hear that", "interlocutor": "Viewer",
    })
    assert llm.calls == 2
    assert "RESPONSE_LANGUAGE: English" in llm.last_messages[-1]["content"]
    assert "Regenera una sola respuesta exclusivamente" in llm.last_messages[-1]["content"]
    assert result.diagnostics.language_retry_used is True
    assert result.diagnostics.response_language_codes == ["en"]
    assert result.original_response == "That sounds lovely; tell me more."


def test_persistently_wrong_language_fails_without_returning_wrong_suggestions(tmp_path):
    from fastapi import HTTPException

    class AlwaysSpanish(FakeLLM):
        def __init__(self):
            super().__init__()
            self.calls = 0

        async def chat(self, messages, count):
            self.calls += 1
            return [completion(["Hola, me alegra mucho verte.", "Qué bonito tenerte aquí; cuéntame más."])]

    llm = AlwaysSpanish()
    endpoint = next(route.endpoint for route in build(tmp_path, llm).routes if getattr(route, "path", None) == "/api/suggestions")
    coroutine = endpoint(SuggestRequest(message="I'm glad to hear that"))
    with pytest.raises(HTTPException) as error:
        coroutine.send(None)
    assert llm.calls == 2
    assert error.value.status_code == 502
    assert "idioma distinto de English" in error.value.detail


def test_memory_isolation_edit_delete_clear(tmp_path):
    app = build(tmp_path)
    a = request(app, "POST", "/api/memory/Ana/notes", json={"text": "Le gusta el café"})
    assert a.status_code == 201
    note_id = a.json()["id"]
    assert len(request(app, "GET", "/api/memory/Ana").json()["notes"]) == 1
    assert request(app, "GET", "/api/memory/Beto").json()["notes"] == []
    changed = request(app, "PUT", f"/api/memory/Ana/notes/{note_id}", json={"text": "Prefiere té"})
    assert changed.json()["text"] == "Prefiere té"
    assert request(app, "DELETE", f"/api/memory/Ana/notes/{note_id}").status_code == 204
    request(app, "POST", "/api/memory/Ana/notes", json={"text": "Nota"})
    assert request(app, "DELETE", "/api/memory/Ana").json()["deleted"] == 1
    assert request(app, "POST", "/api/memory/%20/notes", json={"text": "x"}).status_code == 422


def test_knowledge_defaults_and_files(tmp_path):
    assert "No se ha configurado" in read_knowledge(tmp_path)["perfil.md"]
    tmp_path.mkdir(exist_ok=True)
    (tmp_path / "perfil.md").write_text("Perfil de prueba", encoding="utf-8")
    assert read_knowledge(tmp_path)["perfil.md"] == "Perfil de prueba"


def test_lm_studio_connection_error(monkeypatch):
    class BrokenClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, *args, **kwargs):
            import httpx
            raise httpx.ConnectError("offline")
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", BrokenClient)
    async def run():
        with pytest.raises(LMStudioError, match="No se pudo conectar"):
            await LMStudioClient("http://127.0.0.1:1234/v1", "test").chat([], 1)
    run_immediate_coroutine(run())


def test_lm_studio_http_error_preserves_status_without_response_body(monkeypatch):
    import httpx

    class ErrorClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, *args, **kwargs):
            request = httpx.Request("POST", "http://127.0.0.1:1234/v1/chat/completions")
            response = httpx.Response(503, request=request, text="private service payload")
            response.raise_for_status()
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", ErrorClient)

    async def run():
        with pytest.raises(LMStudioError, match="HTTP 503") as error:
            await LMStudioClient("http://127.0.0.1:1234/v1", "test").chat([], 1)
        assert error.value.http_status == 503
        assert "private service payload" not in str(error.value)
    run_immediate_coroutine(run())


def test_lm_studio_parses_chat_completions_json_contract(monkeypatch):
    import httpx

    class JsonClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, url, **kwargs):
            assert url.endswith("/chat/completions")
            assert kwargs["json"]["n"] == 1
            request = httpx.Request("POST", url)
            return httpx.Response(200, request=request, json={
                "choices": [{"message": {"content": '{"responses":["One"]}'}, "finish_reason": "stop"}]
            })
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", JsonClient)

    async def run():
        content = await LMStudioClient("http://127.0.0.1:1234/v1", "test").chat([], 1)
        assert content == ['{"responses":["One"]}']
    run_immediate_coroutine(run())


def test_lm_studio_disables_qwen3_thinking_to_reserve_tokens_for_json(monkeypatch):
    import httpx

    class JsonClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, url, **kwargs):
            assert kwargs["json"]["chat_template_kwargs"] == {"enable_thinking": False}
            request = httpx.Request("POST", url)
            return httpx.Response(200, request=request, json={
                "choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]
            })
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", JsonClient)

    async def run():
        await LMStudioClient("http://127.0.0.1:1234/v1", "qwen/qwen3-8b").chat([], 1)
    run_immediate_coroutine(run())


def test_lm_studio_marks_length_truncated_output_as_empty_for_controlled_retry(monkeypatch):
    import httpx

    class TruncatedClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, url, **kwargs):
            request = httpx.Request("POST", url)
            return httpx.Response(200, request=request, json={
                "choices": [{"message": {"content": '{"responses":["One", "Two"}'}, "finish_reason": "length"}]
            })
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", TruncatedClient)

    async def run():
        assert await LMStudioClient("http://127.0.0.1:1234/v1", "test").chat([], 1) == []
    run_immediate_coroutine(run())


def test_configuration_validation(monkeypatch):
    from backend.config import Settings
    monkeypatch.setenv("BACKEND_PORT", "70000")
    with pytest.raises(ValueError, match="BACKEND_PORT"):
        Settings.from_env()
    monkeypatch.setenv("BACKEND_PORT", "8765")
    monkeypatch.setenv("LM_STUDIO_BASE_URL", "https://api.example.com/v1")
    with pytest.raises(ValueError, match="LM_STUDIO_BASE_URL"):
        Settings.from_env()
    monkeypatch.setenv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1")
    monkeypatch.setenv("LM_STUDIO_CONTEXT_TOKENS", "512")
    monkeypatch.setenv("LM_STUDIO_OUTPUT_TOKENS", "500")
    with pytest.raises(ValueError, match="LM_STUDIO_CONTEXT_TOKENS"):
        Settings.from_env()


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.20", "localhost", "127.0.0.2", ""])
def test_backend_host_rejects_non_loopback_or_ambiguous_values(monkeypatch, host):
    monkeypatch.setenv("BACKEND_HOST", host)
    with pytest.raises(ValueError, match="BACKEND_HOST debe ser 127.0.0.1"):
        Settings.from_env()


def test_backend_host_is_fixed_to_ipv4_loopback(monkeypatch):
    monkeypatch.setenv("BACKEND_HOST", "127.0.0.1")
    assert Settings.from_env().host == "127.0.0.1"


def test_cors_origin_policy_allows_only_stripchat_https_and_chrome_extensions(tmp_path):
    app = build(tmp_path)
    cors = next(item for item in app.user_middleware if item.cls.__name__ == "CORSMiddleware")
    allowed_origin = re.compile(cors.kwargs["allow_origin_regex"])

    assert allowed_origin.fullmatch("https://es.stripchat.com")
    assert allowed_origin.fullmatch("https://room.eu.stripchat.com")
    assert allowed_origin.fullmatch(f"chrome-extension://{'a' * 32}")
    assert not allowed_origin.fullmatch("http://es.stripchat.com")
    assert not allowed_origin.fullmatch("https://stripchat.com.attacker.example")
    assert not allowed_origin.fullmatch("https://example.com")
    assert not allowed_origin.fullmatch(f"chrome-extension://{'z' * 32}")


def test_manifest_structure():
    manifest = json.loads((Path(__file__).parents[1] / "extension" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["manifest_version"] == 3
    assert "<all_urls>" not in manifest.get("host_permissions", [])
    assert "https://stripchat.com/*" in manifest["content_scripts"][0]["matches"]
