"""Synthetic regressions for identity, grounding and resource boundaries."""
import asyncio
import json

import pytest
from pydantic import ValidationError

from backend.grounding import review_rejection, substantive_draft
from backend.lm_studio import LMStudioError
from backend.prompt import build_translation_messages, build_translation_review_messages
from backend.request_limits import RequestLimitsMiddleware
from backend.schemas import NoteInput, SuggestRequest
from backend.validation import owner_notes, remove_unsupported_clauses, response_rejection
from backend.translation import _perspective_conflict, translate_and_review
from test_translation import TranslationClient, run
from test_app import build, request
from test_real_cases import SequenceLLM


@pytest.mark.parametrize('fields', [
    {'message': 'Hello', 'target_message': 'Other'},
    {'message': 'Hello', 'context': 'A', 'conversation_history': 'B'},
    {'message': 'Hello', 'interlocutor': 'Alice', 'interlocutor_alias': 'Bob'},
])
def test_conflicting_identity_contract_fails_before_generation(fields):
    with pytest.raises(ValidationError):
        SuggestRequest(**fields)


def test_legacy_alias_normalization_remains_compatible():
    assert SuggestRequest(message='Hello', interlocutor=' ALICE  SMITH ', interlocutor_alias='alice smith').interlocutor == 'alice smith'


def test_blank_memory_is_rejected():
    with pytest.raises(ValidationError):
        NoteInput(text=' \n ')


@pytest.mark.parametrize('draft', [
    "I'm enjoying a quiet moment, ready to talk.",
    "Blue is my favorite too.",
    "I actually don't have a favorite color.",
    "I'm always here for you.",
    "That’s my go-to too.",
])
def test_owner_activity_preferences_and_promises_require_owner_evidence(draft):
    assert response_rejection(draft, 'How are you today?', 'en', notes=[{'text': 'Blue is my favorite color.'}]) == 'unsupported_claim'


def test_viewer_notes_are_not_owner_preferences():
    assert owner_notes([{'text': 'Likes blue'}, {'text': 'Owner likes green'}]) == [{'text': 'Owner likes green'}]


def test_deletion_repair_keeps_only_existing_safe_words():
    draft = "I'm doing well, thanks. Just had a lovely chat with Sam."
    assert remove_unsupported_clauses(draft, 'Hello there') == "I'm doing well, thanks."
    assert remove_unsupported_clauses(draft, 'Hello there', context='- Usuario: I talked to Sam.') is None
    assert remove_unsupported_clauses('Just had a lovely chat.', 'Hello there') is None


def test_polite_reaction_removal_preserves_actual_action_to_audit():
    assert substantive_draft("I'm glad I made you laugh.") == 'I made you laugh'


@pytest.mark.parametrize('original,translated,context,conflict', [
    ('Je suis content de mieux te connaître.', 'Me alegra conocerme mejor con usted.', '', True),
    ('Je suis content de mieux te connaître.', 'Me alegra conocerte mejor.', '', False),
    ('Obrigado por querer conhecer melhor.', 'Gracias por querer conocerte mejor.', 'Gostaria de conhecer você melhor.', True),
    ('Obrigado por querer conhecer melhor.', 'Gracias por querer conocerme mejor.', 'Gostaria de conhecer você melhor.', False),
    ('Obrigado por querer conhecer melhor.', 'Gracias por querer conocerte mejor.', '', False),
    ('Hey sweetie, I am well.', 'Hola, hijo mío, estoy bien.', '', True),
    ('Hey sweetie, I am well.', 'Hola, cariño, estoy bien.', '', False),
    ("I'm glad I made you laugh.", 'Me alegra que me hayas hecho reír.', '', True),
    ("I'm glad I made you laugh.", 'Me alegra haberte hecho reír.', '', False),
    ('You made me laugh.', 'Te hice reír.', '', True),
    ('Você me fez rir.', 'Me hiciste reír.', '', False),
])
def test_explicit_translation_object_reversals(original, translated, context, conflict):
    assert bool(_perspective_conflict(original, translated, context)) is conflict


def test_object_reversal_cannot_be_approved_by_model_and_retry_keeps_context():
    client = TranslationClient([json.dumps({'translation': 'Me alegra conocerme mejor con usted.', 'faithful': True, 'adds_or_omits_information': False})])
    original = 'Je suis content de mieux te connaître.'
    outcome = run(translate_and_review(client, original=original, language='French', source_context='Synthetic reference'))
    assert outcome.text is None and outcome.failure_reason == 'perspective_mismatch'
    assert client.translate_calls == 2 and client.review_calls == 0
    assert outcome.retry_state['source_context'] == 'Synthetic reference'
    repaired = TranslationClient([json.dumps({'translation': 'Me alegra conocerte mejor.', 'faithful': True, 'adds_or_omits_information': False})])
    result = run(translate_and_review(repaired, original=original, language='French', manual_retry=True, retry_state=outcome.retry_state))
    assert result.text == 'Me alegra conocerte mejor.'
    # Explicit te already identifies the object; unrelated incoming text must
    # remain cached but must not contaminate this translation task.
    assert 'Synthetic reference' not in repaired.messages[0][1]['content']


def test_empty_self_approval_cannot_override_owner_evidence_requirement():
    verdict = {'supported': True, 'perspective_consistent': True, 'answers_target': True,
               'repeated_idea': False, 'repetitive_question': False, 'personal_claims': []}
    assert review_rejection([json.dumps(verdict)], evidence={'history': '- Usuario: A fact.'}, require_evidence=True) == 'unsupported_claim'
    verdict['personal_claims'] = [{'claim': 'A fact', 'source': 'history', 'evidence_quote': 'A fact.'}]
    assert review_rejection([json.dumps(verdict)], evidence={'history': '- Usuario: A fact.'}, require_evidence=True) == ''


@pytest.mark.parametrize('approve,status', [(True, 200), (False, 502)])
def test_deletion_repair_still_requires_independent_review(tmp_path, approve, status):
    class Reviewed(SequenceLLM):
        audits = []
        async def review_generation(self, messages):
            self.audits.append(json.loads(messages[1]['content']))
            return [json.dumps({'supported': approve, 'perspective_consistent': True, 'answers_target': True,
                                'repeated_idea': False, 'repetitive_question': False, 'personal_claims': []})]
    llm = Reviewed(["I'm doing well, thanks. Just had a lovely chat with Sam."] * 2)
    result = request(build(tmp_path, llm), 'POST', '/api/suggestions', json={'message': 'Hello, how are you today?'})
    assert result.status_code == status
    assert llm.audits
    assert all('Sam' not in audit['draft'] for audit in llm.audits)
    if approve:
        assert result.json()['original_response'] == "I'm doing well, thanks."
        assert result.json()['diagnostics']['draft_repairs'] == ['removed_unsupported_clause']
    else:
        assert 'original_response' not in result.json()
        assert result.json()['diagnostics']['stage'] == 'grounding'


@pytest.mark.parametrize('builder,extra', [(build_translation_messages, {}), (build_translation_review_messages, {'translation': 'Gracias por querer conocerme.'})])
def test_translation_reference_is_separate_from_exact_original(builder, extra):
    original = 'Obrigado por querer me conhecer.'
    messages = builder(original=original, language='Portuguese', source_context='Gostaria de conhecer você melhor.', **extra)
    assert 'Gostaria de conhecer você melhor.' in messages[1]['content']
    assert original in messages[1]['content']
    assert messages[0]['role'] == 'system'


def test_rejected_draft_exposes_precise_reason_without_content(tmp_path):
    app = build(tmp_path, SequenceLLM(['Just had a lovely chat with Sam.'] * 2))
    result = request(app, 'POST', '/api/suggestions', json={'message': 'Hey daddy, how are you today?'})
    assert result.status_code == 502
    assert result.json()['error']['reason_code'] == 'unsupported_claim'
    assert result.json()['diagnostics']['attempts'] == 2
    assert 'Sam' not in json.dumps(result.json())


@pytest.mark.parametrize('reason,status', [('timeout', 504), ('unavailable', 503), ('http_error', 503), ('invalid_response', 503)])
def test_transport_failures_are_distinct_from_content_rejection(tmp_path, reason, status):
    class Unavailable(SequenceLLM):
        async def chat(self, messages, count):
            raise LMStudioError('Local model failed.', reason_code=reason)
    result = request(build(tmp_path, Unavailable([])), 'POST', '/api/suggestions', json={'message': 'Hello, how are you?'})
    assert result.status_code == status
    assert result.json()['error']['reason_code'] == 'lm_studio_' + reason
    assert result.json()['diagnostics']['stage'] == 'generation'


@pytest.mark.parametrize('chunks,declared,expected', [([b'123', b'456'], None, 413), ([b'1234'], None, 204), ([b''], b'6', 413)])
def test_request_limit_checks_declared_and_chunked_body(chunks, declared, expected):
    async def exercise():
        sent = []
        received = []
        events = [{'type': 'http.request', 'body': value, 'more_body': i < len(chunks)-1} for i, value in enumerate(chunks)]
        async def receive():
            return events.pop(0)
        async def send(message):
            sent.append(message)
        async def downstream(scope, receive, send):
            while True:
                event = await receive()
                received.append(event['body'])
                if not event.get('more_body'):
                    break
            await send({'type': 'http.response.start', 'status': 204, 'headers': []})
        await RequestLimitsMiddleware(downstream, max_bytes=4)({'type': 'http', 'headers': [] if declared is None else [(b'content-length', declared)]}, receive, send)
        assert sent[0]['status'] == expected
        assert received == (chunks if expected == 204 else [])
    asyncio.run(exercise())
