"""Two automatic requests, synthetic alias, no real profile or memory files."""
import json

import pytest

from backend.roles import address_frame
from backend.grounding import substantive_draft
from backend.validation import response_duplicate_source, response_rejection
from test_app import build, request
from test_real_cases import SequenceLLM

FIRST = 'Hey daddy, how are you today?'
SECOND = 'I missed talking to you, daddy.'


def payload(target, identity):
    return {'message': target, 'target_message': target, 'target_message_id': identity,
            'conversation_id': 'synthetic-incident', 'interlocutor': 'Synthetic-Incident',
            'configured_mode': 'auto', 'generation_trigger': 'automatic', 'target_is_incoming': True}


@pytest.mark.parametrize('target', [FIRST, SECOND])
def test_both_vocative_positions_address_owner(target):
    assert address_frame(target)['vocative_addresses'] == 'account_owner'
    assert address_frame(target)['incoming_vocative'] == 'daddy'
    assert response_rejection("I'm right here, daddy. Glad to hear from you.", target, 'en') == 'perspective_mismatch'


@pytest.mark.parametrize('reply', [SECOND, 'I missed talking to you too, daddy.', 'I missed talking to you.'])
def test_real_echoes_are_still_rejected(reply):
    assert response_duplicate_source(reply, SECOND) == 'target_incoming'
    assert response_rejection(reply, SECOND, 'en') == 'repeated_response'


def test_valid_acknowledgment_is_not_a_duplicate_of_second_target():
    assert response_duplicate_source('It is good to hear from you again.', SECOND, ("I'm doing well, thanks.",)) is None


def test_courtesy_filter_does_not_leave_an_orphan_for_asking_to_be_rejected():
    assert substantive_draft("I'm doing well—thanks for asking!") == ''
    assert substantive_draft("I'm doing well—thank you for checking in.") == ''
    assert 'promise' in substantive_draft('Thanks for keeping your promise.').lower()
    assert 'watching' in substantive_draft("Thanks for asking. I'm watching a movie.").lower()


def test_contraction_and_greeting_words_do_not_become_substantive_repeated_phrase():
    previous = ("Hey there I'm doing great",)
    assert response_rejection("Hey there, I'm good—thanks for checking in!", FIRST, 'en', previous) == ''
    assert response_rejection(previous[0], FIRST, 'en', previous) == 'repeated_response'


def test_combined_wrong_address_and_unsupported_clause_keep_only_reviewed_existing_words(tmp_path):
    class Reviewed(SequenceLLM):
        async def review_generation(self, messages):
            data = json.loads(messages[1]['content'])
            assert 'thinking' not in data['draft'] and 'daddy' not in data['draft']
            return [json.dumps({'supported': True, 'perspective_consistent': True, 'answers_target': True,
                                'repeated_idea': False, 'repetitive_question': False, 'personal_claims': []})]
    result = request(build(tmp_path, Reviewed(["I'm glad you reached out, daddy. I've been thinking about our conversations too."])),
                     'POST', '/api/suggestions', json=payload(SECOND, 'second'))
    assert result.status_code == 200
    assert result.json()['original_response'] == "I'm glad you reached out."
    assert result.json()['diagnostics']['draft_repairs'] == ['removed_reversed_vocative', 'removed_unsupported_clause']


@pytest.mark.parametrize('approve,status', [(True, 200), (False, 502)])
def test_vocative_deletion_requires_independent_audit(tmp_path, approve, status):
    class Reviewed(SequenceLLM):
        async def review_generation(self, messages):
            audit = json.loads(messages[1]['content'])
            assert audit['role_frame']['vocative_addresses'] == 'account_owner'
            assert 'daddy' not in audit['draft'].lower()
            return [json.dumps({'supported': approve, 'perspective_consistent': True, 'answers_target': True,
                                'repeated_idea': False, 'repetitive_question': False, 'personal_claims': []})]
    llm = Reviewed(["Hey daddy, I'm doing well, thanks."]*2)
    result = request(build(tmp_path, llm), 'POST', '/api/suggestions', json=payload(FIRST, 'first'))
    assert result.status_code == status
    if approve:
        assert result.json()['original_response'] == "I'm doing well, thanks."
        assert result.json()['diagnostics']['draft_repairs'] == ['removed_reversed_vocative']
    else:
        assert 'original_response' not in result.json()


def test_two_targets_and_retry_preserve_current_message_and_draft_is_not_history(tmp_path):
    llm = SequenceLLM(["I'm doing well, thanks for asking.", SECOND, 'It is good to hear from you again.'])
    app = build(tmp_path, llm)
    first = request(app, 'POST', '/api/suggestions', json=payload(FIRST, 'first'))
    assert first.status_code == 200
    second = request(app, 'POST', '/api/suggestions', json={**payload(SECOND, 'second'), 'context': '- Interlocutor: '+FIRST})
    assert second.status_code == 200
    for messages in llm.prompts[1:]:
        assert SECOND in messages[1]['content'].split('OBJETIVO ACTUAL')[1]
        history_block = messages[1]['content'].split('HISTORIAL CONTEXTUAL')[1].split('Contexto adicional')[0]
        assert first.json()['original_response'] not in history_block
    assert SECOND in llm.prompts[2][-1]['content']
    assert first.json()['original_response'] not in '- Interlocutor: '+FIRST
    assert not app.state.memory.list_notes('Synthetic-Incident')


@pytest.mark.parametrize('source', ['target_incoming', 'previous_unsubmitted_draft'])
def test_terminal_duplicate_reports_comparison_source_without_text(tmp_path, source):
    previous = "I'm doing well, thanks for asking."
    drafts = [SECOND, SECOND] if source == 'target_incoming' else [previous, previous, previous]
    app = build(tmp_path, SequenceLLM(drafts))
    if source == 'previous_unsubmitted_draft':
        assert request(app, 'POST', '/api/suggestions', json=payload(FIRST, 'first')).status_code == 200
    result = request(app, 'POST', '/api/suggestions', json=payload(SECOND, 'second'))
    assert result.status_code == 502
    assert result.json()['diagnostics']['duplicate_source'] == source
    assert SECOND not in json.dumps(result.json())


@pytest.mark.parametrize('draft', ["I'm doing well, daddy—thanks for asking.", "I'm doing well, daddy, thanks for asking.", "I'm fine, sir; thanks."])
def test_mid_sentence_vocative_is_detected_and_removed_without_new_role(draft):
    from backend.roles import remove_reversed_vocative
    incoming = 'Hey sir, how are you?' if 'sir' in draft else FIRST
    assert response_rejection(draft, incoming, 'en') == 'perspective_mismatch'
    repaired = remove_reversed_vocative(draft)
    assert 'daddy' not in repaired and 'sir' not in repaired
    assert response_rejection(repaired, incoming, 'en') == ''


def test_ordinary_role_noun_is_not_treated_as_vocative():
    from backend.roles import incoming_address
    assert incoming_address('My daddy is visiting tomorrow.') is None
