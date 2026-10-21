import json

from backend.answers import parse_translation
from backend.lm_studio import LMStudioClient, LMStudioError
from backend.prompt import build_translation_messages, build_translation_review_messages
from backend.translation import translate_and_review


def run(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as finished:
        return finished.value
    raise AssertionError("test client unexpectedly yielded")


class TranslationClient:
    def __init__(self, translated, reviewed=None, error=None):
        self.translated = translated
        self.reviewed = reviewed or [json.dumps({
            "meaning_preserved": True,
            "no_added_or_omitted_information": True,
            "translation_is_spanish": True,
        })]
        self.error = error
        self.review_calls = 0
        self.translate_calls = 0
        self.messages = []

    async def translate(self, messages):
        self.translate_calls += 1
        self.messages.append(messages)
        if self.error:
            raise self.error
        return self.translated

    async def review_translation(self, messages):
        self.review_calls += 1
        return self.reviewed


def test_parser_extracts_translation_json_with_surrounding_text_and_optional_review_flags():
    answer = 'Translation follows:\n{"translation":"Me alegra que te hice reír.","faithful":true}\nDone.'
    assert parse_translation(answer) == "Me alegra que te hice reír."


def test_translation_is_accepted_when_heuristic_language_detection_is_uncertain(monkeypatch):
    monkeypatch.setattr("backend.translation.classify_language", lambda text: (None, 0.0))
    client = TranslationClient([
        json.dumps({"translation": "Qué bien.", "faithful": True, "adds_or_omits_information": False})
    ])
    outcome = run(translate_and_review(client, original="That's great.", language="English"))
    assert outcome.text == "Qué bien."
    assert client.review_calls == 1


def test_uncertain_language_requires_positive_review_language_signal(monkeypatch):
    monkeypatch.setattr("backend.translation.classify_language", lambda text: (None, 0.0))
    client = TranslationClient([
        json.dumps({"translation": "So good.", "faithful": True, "adds_or_omits_information": False})
    ], reviewed=[json.dumps({"meaning_preserved": True, "no_added_or_omitted_information": True, "translation_is_spanish": False})])
    outcome = run(translate_and_review(client, original="That's great.", language="English"))
    assert outcome.text is None
    assert outcome.failure_reason == "wrong_language"


def test_empty_and_unrecognized_translation_responses_have_distinct_reasons():
    empty = run(translate_and_review(TranslationClient([]), original="Hello.", language="English"))
    malformed = run(translate_and_review(TranslationClient(["not structured output"]), original="Hello.", language="English"))
    assert empty.failure_reason == "empty_response"
    assert malformed.failure_reason == "invalid_format"


def test_wrong_language_and_failed_fidelity_review_are_reported():
    wrong = run(translate_and_review(TranslationClient([
        json.dumps({"translation": "That is lovely.", "faithful": True, "adds_or_omits_information": False})
    ]), original="That's lovely.", language="English"))
    assert wrong.failure_reason == "wrong_language"

    failed = run(translate_and_review(TranslationClient([
        json.dumps({"translation": "Me envías más dinero.", "faithful": True, "adds_or_omits_information": False})
    ], reviewed=[json.dumps({"meaning_preserved": False, "no_added_or_omitted_information": False, "translation_is_spanish": True})]), original="That's lovely.", language="English"))
    assert failed.failure_reason == "fidelity_review_failed"


def test_timeout_and_http_errors_preserve_safe_status_diagnostics():
    timeout = run(translate_and_review(TranslationClient([], error=LMStudioError("LM Studio tardó demasiado en responder.")), original="Hi.", language="English"))
    http = run(translate_and_review(TranslationClient([], error=LMStudioError("LM Studio devolvió HTTP 429.", 429)), original="Hi.", language="English"))
    assert timeout.failure_reason == "timeout"
    assert http.failure_reason == "http_error"
    assert http.http_status == 429


def test_translation_preserves_emoji_flirty_text_and_special_characters():
    original = '“That was cute 😏💖” — don’t make me blush! <3'
    translated = '«Eso fue tierno 😏💖» — ¡no hagas que me sonroje! <3'
    client = TranslationClient([json.dumps({"translation": translated}, ensure_ascii=False)])
    outcome = run(translate_and_review(client, original=original, language="English"))
    assert outcome.text == translated
    assert original in client.messages[0][1]["content"]


def test_translation_prompt_requires_contextual_idiom_and_role_preservation():
    original = "You know how I like hearing you like that 😏"
    translated = "Sabes cuánto me gusta escucharte así 😏"
    client = TranslationClient([json.dumps({"translation": translated}, ensure_ascii=False)])
    outcome = run(translate_and_review(client, original=original, language="English"))
    assert outcome.text == translated
    system = client.messages[0][0]["content"]
    assert "una afirmación no se convierte en pregunta" in system
    assert "Bonsoir corresponde a Buenas noches" in system
    assert "expresiones idiomáticas por su sentido contextual" in system
    assert "I/me/my son del usuario y you/your del interlocutor" in system
    assert "no los conviertas en parentescos literales" in system
    review = build_translation_review_messages(original=original, translation=translated, language="English")
    assert "perspectiva del usuario como autor" in review[0]["content"]


def test_long_translation_is_not_limited_to_the_old_700_token_cap():
    translated = "Me encanta hablar contigo. " * 180
    original = "I love talking with you. " * 180
    client = TranslationClient([json.dumps({"translation": translated}, ensure_ascii=False)])
    outcome = run(translate_and_review(client, original=original, language="English"))
    assert outcome.text == translated.strip()


def test_incomplete_translation_is_retried_once_with_explicit_complete_output_instruction():
    class RetryingClient(TranslationClient):
        async def translate(self, messages):
            self.translate_calls += 1
            self.messages.append(messages)
            if self.translate_calls == 1:
                return ['{"translation":"Me alegra que']
            return [json.dumps({"translation": "Me alegra que estés aquí 😊."}, ensure_ascii=False)]

    client = RetryingClient([])
    outcome = run(translate_and_review(client, original="I'm glad you're here 😊.", language="English"))
    assert outcome.text == "Me alegra que estés aquí 😊."
    assert client.translate_calls == 2
    assert "Reintento por una salida previa incompleta" in client.messages[1][0]["content"]


def test_fidelity_retry_receives_semantic_correction_reason():
    class Client(TranslationClient):
        async def review_translation(self, messages):
            self.review_calls += 1
            return [json.dumps({"meaning_preserved": self.review_calls > 1,
                                "no_added_or_omitted_information": self.review_calls > 1,
                                "translation_is_spanish": True})]

    client = Client([json.dumps({"translation": "Buenas noches, estoy bien, gracias."})])
    outcome = run(translate_and_review(client, original="Bonsoir, je vais bien, merci.", language="français"))
    assert outcome.text == "Buenas noches, estoy bien, gracias."
    assert client.translate_calls == 2
    assert "corrige la fidelidad, no solo el formato" in client.messages[1][0]["content"]


def test_added_question_is_rejected_independently_of_model_review():
    client = TranslationClient([json.dumps({"translation": "¿Todo bien? Gracias por preguntar."})])
    outcome = run(translate_and_review(client, original="Tudo bem, obrigado por perguntar.", language="português"))
    assert outcome.text is None
    assert outcome.failure_reason == "added_question"
    assert client.translate_calls == 2
    assert client.review_calls == 0
    assert "El original no tiene preguntas" in client.messages[1][0]["content"]


def test_unpunctuated_question_can_be_translated_with_question_marks():
    client = TranslationClient([json.dumps({"translation": "¿Cómo estás?"})])
    outcome = run(translate_and_review(client, original="How are you", language="English"))
    assert outcome.text == "¿Cómo estás?"


def test_translation_retry_is_bounded_when_model_keeps_returning_incomplete_json():
    class AlwaysIncompleteClient(TranslationClient):
        async def translate(self, messages):
            self.translate_calls += 1
            return ['{"translation":"incomplete']

    client = AlwaysIncompleteClient([])
    outcome = run(translate_and_review(client, original="I miss you.", language="English"))
    assert outcome.text is None
    assert outcome.failure_reason == "invalid_format"
    assert client.translate_calls == 2


def test_retry_can_recover_from_intermittent_review_failure():
    class ReviewRetryClient(TranslationClient):
        async def review_translation(self, messages):
            self.review_calls += 1
            if self.review_calls == 1:
                return ['{"meaning_preserved": false,"no_added_or_omitted_information":false}']
            return [json.dumps({
                "meaning_preserved": True,
                "no_added_or_omitted_information": True,
                "translation_is_spanish": True,
            })]

    client = ReviewRetryClient([json.dumps({"translation": "Te extraño 😊.", "faithful": True})])
    outcome = run(translate_and_review(client, original="I miss you 😊.", language="English"))
    assert outcome.text == "Te extraño 😊."
    assert client.translate_calls == 2
    assert client.review_calls == 2


def test_lm_client_uses_configured_translation_output_budget_and_identifies_truncation(monkeypatch):
    class Response:
        status_code = 200

        def __init__(self, finish_reason):
            self.finish_reason = finish_reason

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{
                "message": {"content": '{"translation":"Hola 😊"}'},
                "finish_reason": self.finish_reason,
            }]}

    class HttpClient:
        finish_reason = "stop"
        payloads = []

        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, url, **kwargs):
            self.payloads.append(kwargs["json"])
            return Response(self.finish_reason)

    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", HttpClient)

    async def exercise_client():
        client = LMStudioClient("http://127.0.0.1:1234/v1", "test", max_tokens=1200)
        assert await client.translate([]) == ['{"translation":"Hola 😊"}']
        assert HttpClient.payloads[-1]["max_tokens"] == 1200
        HttpClient.finish_reason = "length"
        try:
            await client.translate([])
        except LMStudioError as exc:
            assert exc.reason_code == "truncated"
        else:
            raise AssertionError("truncated translation should be reported explicitly")

    run(exercise_client())
