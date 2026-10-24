"""Regression cases reproduced during the authorized stabilization closure."""
import json

import pytest

from backend.answers import _is_duplicate
from backend.translation import translate_and_review
from backend.translation import _repair_known_greetings
from backend.translation import _translation_reference
from backend.validation import response_rejection
from backend.language import classify_language
from test_app import build, request
from test_real_cases import SequenceLLM
from test_translation import TranslationClient, run


def test_emoji_target_does_not_duplicate_every_text_reply():
    assert not _is_duplicate('Bonjour, comment vas-tu ?', '😏')
    assert not _is_duplicate('😀', '😏')
    assert _is_duplicate('😏', '😏')
    assert response_rejection('Bonjour, que veux-tu dire ?', '😏', 'fr') == ''


def test_same_help_acknowledgment_is_a_repeated_idea():
    previous = ("You're welcome—happy to have been of help.",)
    assert response_rejection("You're welcome — glad I could help.", 'Thanks for listening.', 'en', previous) == 'repeated_idea'
    assert response_rejection("You're welcome. What music do you enjoy?", 'Thanks for listening.', 'en', previous) == ''


def test_present_chat_embellishment_is_not_a_plain_courtesy():
    assert response_rejection("I'm doing great—just loving this little chat with you today.", 'Hey daddy, how are you today?', 'en') == 'unsupported_claim'


def test_generic_question_alone_does_not_answer_a_reconnection_statement():
    assert response_rejection("How's your day going?", 'I missed talking to you.', 'en') == 'contextually_irrelevant'


@pytest.mark.parametrize('reply', ["Got it — let’s dive into some tunes then!", "Alright, let's talk about music then."])
def test_valid_english_topic_change_is_not_rejected_as_unknown_language(reply):
    assert classify_language(reply)[0] == 'en'
    # Copy/meaning checks remain independent of language recognition.
    assert response_rejection(reply, "Let's talk about music instead.", 'en') != 'wrong_language'


@pytest.mark.parametrize('reply', ["Cobalt-731, I think that’s the one I’ve been meaning to share.", "I always enjoy a good chat."])
def test_owner_intentions_and_general_preferences_need_evidence(reply):
    assert response_rejection(reply, 'Which color do I like?', 'en') == 'unsupported_claim'


def test_kinship_vocative_repair_still_requires_full_semantic_review():
    client = TranslationClient([json.dumps({'translation': 'Hola, hijo mío, estoy bien.', 'faithful': True})])
    result = run(translate_and_review(client, original="Hey sweetie I'm doing great", language='English'))
    assert result.text == 'Hola, cariño, estoy bien.'
    assert client.review_calls == 1
    rejecting = TranslationClient([json.dumps({'translation': 'Hola, hijo mío, estoy bien.', 'faithful': True})], reviewed=[json.dumps({'meaning_preserved': False, 'no_added_or_omitted_information': False})])
    assert run(translate_and_review(rejecting, original="Hey sweetie I'm doing great", language='English')).text is None


def test_self_rejected_valid_json_is_a_fidelity_failure_not_a_format_failure():
    client = TranslationClient([json.dumps({'translation': 'Me alegra conocer你 mejor.', 'faithful': False, 'adds_or_omits_information': True})])
    result = run(translate_and_review(client, original='Fico feliz em conhecer você melhor.', language='Portuguese'))
    assert result.text is None and result.failure_reason == 'generator_fidelity_failed'
    assert client.translate_calls == 2 and client.review_calls == 0
    assert 'conocer你' in result.retry_state['candidate']
    assert 'No reutilices el candidato' in client.messages[1][0]['content']
    assert 'conocer你' not in client.messages[1][1]['content']


def test_only_elliptical_translation_receives_incoming_reference():
    assert _translation_reference('Obrigado por querer conhecer melhor.', 'Gostaria de conhecer você melhor.') == 'Gostaria de conhecer você melhor.'
    assert _translation_reference('Fico feliz em conhecer você melhor.', 'Gostaria de conhecer você melhor.') == ''
    assert _translation_reference('I made you laugh.', 'You made me laugh.') == ''


@pytest.mark.parametrize('source,candidate,expected', [
    ("Glad you're thinking of me.", 'Me alegra que piensas de mí.', 'Me alegra que piensas en mí.'),
    ('That joke landed well.', 'Me alegra que el chiste haya aterrizado bien.', 'Me alegra que el chiste haya funcionado bien.'),
    ('The plane landed well.', 'El avión ha aterrizado bien.', 'El avión ha aterrizado bien.'),
    ('My son is here.', 'Hola, hijo mío.', 'Hola, hijo mío.'),
])
def test_narrow_idiom_repairs_do_not_change_literal_meanings(source, candidate, expected):
    assert _repair_known_greetings(source, candidate) == expected


def test_viewer_note_cannot_support_an_owner_claim_even_with_reviewer_approval(tmp_path):
    class Reviewed(SequenceLLM):
        async def review_generation(self, messages):
            return [json.dumps({'supported': True, 'perspective_consistent': True, 'answers_target': True,
                'repeated_idea': False, 'repetitive_question': False,
                'personal_claims': [{'claim': 'Owner likes cobalt-731', 'source': 'notes',
                                     'evidence_quote': 'Explicit viewer preference: favorite color is cobalt-731.'}]})]
    app = build(tmp_path, Reviewed(['Cobalt-731 has a glow I love.'] * 2))
    app.state.memory.add_note(app.state.test_account_id, 'Synthetic', 'Explicit viewer preference: favorite color is cobalt-731.')
    result = request(app, 'POST', '/api/suggestions', json={'message': 'Which color do I like?', 'interlocutor': 'Synthetic'})
    assert result.status_code == 502
    assert result.json()['error']['reason_code'] == 'unsupported_claim'


@pytest.mark.parametrize("draft", [
    "Hey sweetie, I'm doing great—just loving these little chats with you today!",
    "Hey sweetie, I'm doing great—just chilling and ready to chat with you.",
    "I'm good—just enjoying these chats with you. How’s your day going?",
])
def test_real_plural_chat_embellishments_require_owner_evidence(draft):
    assert response_rejection(draft, "Hey daddy, how are you today?", "en") == "unsupported_claim"


def test_plural_chat_guard_preserves_willingness_and_explicit_owner_evidence():
    assert response_rejection("I'm here and ready to talk.", "I missed talking to you, daddy.", "en") == ""
    draft = "I'm enjoying these chats with you."
    assert response_rejection(draft, "How are you today?", "en", context="- Usuario: I'm enjoying these chats with you.") == ""
