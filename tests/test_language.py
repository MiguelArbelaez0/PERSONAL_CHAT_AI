import pytest

from backend.language import classify_language, detect_language
from backend.prompt import build_suggestion_messages
from backend.knowledge import DEFAULTS


@pytest.mark.parametrize(("message", "expected"), [
    ("I would love to see you tonight", "en"),
    ("Quiero que sigas hablando conmigo", "es"),
    ("Je veux te voir ce soir", "fr"),
    ("Quero te ver agora", "pt"),
    ("Ich möchte dich heute sehen", "de"),
    ("Voglio vederti stasera", "it"),
])
def test_detects_language_from_the_target_incoming_message(message, expected):
    decision = detect_language(message, "- Interlocutor: unrelated previous message")
    assert decision.code == expected
    assert decision.rule == "last_incoming_message"


def test_short_ambiguous_message_falls_back_to_predominant_recent_incoming_language():
    decision = detect_language(
        "hey",
        "- Interlocutor (10:00): I would love to see you\n"
        "- Usuario (10:01): Estoy aquí\n"
        "- Interlocutor (10:02): What are you doing tonight?",
    )
    assert decision.code == "en"
    assert decision.rule == "recent_incoming_context"


def test_emoji_only_target_uses_recent_incoming_language():
    decision = detect_language(
        "😊🎁",
        "- Interlocutor (10:00): I'm glad to hear that\n"
        "- Usuario (10:01): Estoy aquí\n"
        "- Interlocutor (10:02): It's great to have you here",
    )
    assert decision.code == "en"
    assert decision.rule == "recent_incoming_context"


def test_real_english_stripchat_phrases_and_slang_use_recent_incoming_context():
    assert detect_language("I'm glad to hear that").code == "en"
    assert detect_language("It's great to have you here").code == "en"
    decision = detect_language(
        "heeey chub 😊",
        "- Interlocutor (10:00): I'm glad to hear that\n"
        "- Usuario (10:01): Estoy muy bien\n"
        "- Interlocutor (10:02): It's great to have you here",
    )
    assert decision.code == "en"
    assert decision.rule == "recent_incoming_context"


def test_language_changes_with_the_incoming_message_not_the_profile_or_previous_language():
    english = detect_language("What are you doing tonight?", "- Interlocutor: Hola")
    spanish = detect_language("¿Qué haces esta noche?", "- Interlocutor: What are you doing tonight?")
    assert (english.code, spanish.code) == ("en", "es")
    assert english.rule == spanish.rule == "last_incoming_message"


def test_last_incoming_target_wins_over_an_older_language_and_own_message():
    decision = detect_language(
        "I'm glad to hear that",
        "- Interlocutor (10:00): Hola, qué tal\n"
        "- Interlocutor (10:01): It's great to have you here\n"
        "- Usuario (10:02): Me alegra que estés aquí",
    )
    assert decision.code == "en"
    assert decision.rule == "last_incoming_message"


def test_emojis_numbers_and_links_do_not_override_message_language():
    assert detect_language("Hola 😊 200 TK https://example.test").code == "es"


def test_unrecognized_script_is_detected_and_unknown_text_uses_configured_fallback():
    assert detect_language("مرحبا، كيف حالك؟").code == "ar"
    assert detect_language("??? 123 😊", "", "fr").code == "fr"
    assert detect_language("??? 123 😊", "", "fr").rule == "configured_fallback"


def test_ambiguous_message_uses_only_incoming_rows_for_context_fallback():
    decision = detect_language(
        "hey",
        "- Interlocutor (10:00): ¿Qué haces hoy?\n"
        "- Usuario (10:01): What are you doing?\n"
        "- Interlocutor (10:02): Estoy en casa.",
    )
    assert decision.code == "es"
    assert decision.rule == "recent_incoming_context"


@pytest.mark.parametrize(("expected", "answers"), [
    ("en", ["That sounds lovely, I would be happy to hear more.", "I like your energy; tell me what you have in mind."]),
    ("es", ["Me alegra mucho verte, cuéntame más.", "Qué bonito tenerte aquí; dime qué tienes en mente."]),
    ("fr", ["Ça me fait plaisir de te lire, raconte-moi davantage.", "J'aime ton énergie; dis-moi ce que tu as en tête."]),
    ("pt", ["Fico feliz por você estar aqui, conta-me mais.", "Adoro a sua energia; diz-me o que tem em mente."]),
    ("de", ["Das klingt toll, ich freue mich darauf.", "Ich mag deine Energie; erzähl mir, was du vorhast."]),
    ("it", ["Che bello rivederti, mi fa piacere.", "Adoro la tua energia; dimmi cosa hai in mente."]),
])
def test_both_validated_replies_match_the_requested_language(expected, answers):
    assert [classify_language(answer)[0] for answer in answers] == [expected, expected]


def test_profile_language_preference_cannot_override_dynamic_response_language():
    knowledge = dict(DEFAULTS)
    knowledge["estilo_de_comunicacion.md"] = "Responde siempre en español; aplica un tono amable."
    system, user = build_suggestion_messages(
        message="I'm glad to hear that", context="", interlocutor="Viewer", notes=[],
        knowledge=knowledge, language="English", count=1,
    )
    assert "RESPONSE_LANGUAGE: English" in system["content"]
    assert "Esta regla de idioma tiene prioridad" in system["content"]
    assert "Responde siempre en español" in user["content"]


@pytest.mark.parametrize(("message", "language"), [
    ("What are you doing?", "English"),
    ("¿Qué haces?", "español"),
    ("Comment vas-tu?", "français"),
        ("oups désolée il m'a pris comme ça puis baisée", "français"),
    ("Como você está?", "português"),
    ("Was machst du?", "Deutsch"),
    ("Che cosa vuoi?", "italiano"),
])
def test_detected_language_is_an_explicit_prompt_constraint(message, language):
    decision = detect_language(message)
    system, _ = build_suggestion_messages(
        message=message, context="", interlocutor=None, notes=[],
        knowledge=DEFAULTS, language=decision.name, count=1,
    )
    assert decision.name == language
    assert f"Idioma detectado para el mensaje objetivo: {language}" in system["content"]
    assert "Responde en ese mismo idioma" in system["content"]
    assert 'Genera exactamente 1 respuesta' in system["content"]
    assert '"responses": [' in system["content"]


def test_common_french_to_spanish_translation_is_recognized_as_spanish():
    assert classify_language("También tuve un día largo en el trabajo, pero hice bien el trabajo ¡eh! 😊")[0] == "es"
