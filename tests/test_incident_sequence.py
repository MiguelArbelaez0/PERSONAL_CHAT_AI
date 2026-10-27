"""Two automatic requests, synthetic alias, no real profile or memory files."""
import json

import pytest

from backend.roles import address_frame
from backend.grounding import substantive_draft
from backend.validation import RecentDrafts, response_duplicate_source, response_rejection
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


def test_antirepetition_rejects_near_copy_but_allows_a_different_reply_on_same_topic():
    previous = "That sounds like a fun way to try board games, especially with a silly timer."
    near_copy = "That sounds like a fun way to try board games, especially with a silly timer tonight."
    topical_alternative = "That rainy afternoon could be more playful with a board game."

    assert response_rejection(near_copy, "What are some fun ideas for a rainy day?", "en", (previous,)) == "repeated_response"
    assert response_rejection(topical_alternative, "What are some fun ideas for a rainy day?", "en", (previous,)) == ""


def test_common_greeting_expressions_may_recur_in_useful_short_replies():
    previous = "It's good to hear from you."
    assert response_rejection("Good to hear from you; how have you been?", "Hey, how are you?", "en", (previous,)) == ""
    assert response_rejection("It is always nice to hear from you.", "Hey, how are you?", "en", ("Nice to hear from you!",)) == ""
    assert response_rejection("I'm doing great, thanks for asking.", "Hey, how are you?", "en", ("I'm doing well, thanks for asking.",)) == ""


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
    assert not app.state.memory.list_notes(app.state.test_account_id, 'Synthetic-Incident')


def test_three_manual_generations_for_same_target_can_return_distinct_drafts(tmp_path):
    target = 'What kind of music do you like?'
    llm = SequenceLLM([
        'A playful answer can keep this topic light and fun.',
        'There is plenty to discover in a great conversation.',
        'We could turn this into a fun little guessing game.',
    ])
    app = build(tmp_path, llm)
    request_data = {
        'message': target, 'target_message': target, 'target_message_id': 'synthetic-incoming-1',
        'conversation_id': 'synthetic-consecutive-chat', 'interlocutor': 'Synthetic visitor',
        'configured_mode': 'manual', 'generation_trigger': 'manual', 'target_is_incoming': True,
    }

    responses = [request(app, 'POST', '/api/suggestions', json=request_data) for _ in range(3)]

    assert [response.status_code for response in responses] == [200, 200, 200]
    drafts = [response.json()['original_response'] for response in responses]
    assert len(set(drafts)) == 3
    assert llm.calls == 3
    assert all(response.json()['target_message_id'] == 'synthetic-incoming-1' for response in responses)
    assert 'Borradores previos no enviados' in llm.prompts[1][1]['content']
    assert 'Borradores previos no enviados' in llm.prompts[2][1]['content']
    assert not app.state.memory.list_notes(app.state.test_account_id, 'Synthetic visitor')


def _short_greeting_drafts(count=50):
    adjectives = ["cozy", "playful", "fresh", "creative", "relaxing", "curious", "colorful", "quiet", "fun", "clever"]
    topics = ["playlists", "board games", "mystery films", "art projects", "travel stories"]
    templates = [
        "It's good to hear from you! What kind of {topic} sounds fun today?",
        "Nice to hear from you! Have you tried {topic} lately?",
        "Glad you messaged! Would {topic} be something you'd enjoy?",
        "I'm happy you wrote! What do you think about {topic}?",
        "It's lovely hearing from you! Would {topic} make a good plan?",
    ]
    drafts = [
        templates[index % len(templates)].format(
            topic=f"{adjectives[index // len(topics)]} {topics[index % len(topics)]}",
        )
        for index in range(count)
    ]
    return drafts


def test_fifty_manual_short_greeting_generations_have_no_cumulative_limit(tmp_path):
    drafts = _short_greeting_drafts()
    target = "What are some fun ideas for a rainy day?"
    llm = SequenceLLM(drafts)
    app = build(tmp_path, llm)
    request_data = {
        'message': target, 'target_message': target, 'target_message_id': 'same-incoming-id',
        'conversation_id': 'synthetic-manual-50', 'interlocutor': 'Synthetic visitor',
        'configured_mode': 'manual', 'generation_trigger': 'manual', 'target_is_incoming': True,
    }

    responses = [request(app, 'POST', '/api/suggestions', json=request_data) for _ in range(50)]

    assert all(response.status_code == 200 for response in responses)
    assert len({response.json()['original_response'] for response in responses}) == 50
    assert llm.calls == 50
    assert drafts[3] in llm.prompts[5][1]['content']
    assert drafts[4] in llm.prompts[5][1]['content']
    assert drafts[0] not in llm.prompts[5][1]['content']
    assert not app.state.memory.list_notes(app.state.test_account_id, 'Synthetic visitor')


def test_five_recent_drafts_do_not_block_reuse_of_an_older_valid_greeting(tmp_path):
    drafts = _short_greeting_drafts(5)
    llm = SequenceLLM([*drafts, drafts[0]])
    app = build(tmp_path, llm)
    request_data = {
        'message': 'Hey, how are you today?', 'target_message': 'Hey, how are you today?',
        'target_message_id': 'same-greeting', 'conversation_id': 'synthetic-five-drafts',
        'interlocutor': 'Synthetic greeting visitor', 'configured_mode': 'manual',
        'generation_trigger': 'manual', 'target_is_incoming': True,
    }

    responses = [request(app, 'POST', '/api/suggestions', json=request_data) for _ in range(5)]
    sixth = request(app, 'POST', '/api/suggestions', json=request_data)

    assert all(response.status_code == 200 for response in responses)
    assert sixth.status_code == 200
    assert sixth.json()['original_response'] == drafts[0]
    sixth_prompt = llm.prompts[5][1]['content']
    assert drafts[0] not in sixth_prompt
    assert drafts[-2] in sixth_prompt and drafts[-1] in sixth_prompt
    assert not app.state.memory.list_notes(app.state.test_account_id, 'Synthetic greeting visitor')


def test_a_duplicate_generation_failure_does_not_lock_out_later_recovery(tmp_path, caplog):
    first = "That sounds like a fun way to try board games, especially with a silly timer."
    recovered = "What if you tried cookie baking and added a colorful theme for a twist?"
    llm = SequenceLLM([first, first, first, recovered])
    app = build(tmp_path, llm)
    private_incoming = 'Synthetic private incoming marker 8f2a: what do you think?'
    request_data = {
        'message': private_incoming, 'target_message': private_incoming,
        'target_message_id': 'same-incoming-id', 'conversation_id': 'synthetic-recovery',
        'interlocutor': 'Synthetic recovery visitor', 'configured_mode': 'manual',
        'generation_trigger': 'manual', 'target_is_incoming': True,
    }

    accepted = request(app, 'POST', '/api/suggestions', json=request_data)
    duplicate = request(app, 'POST', '/api/suggestions', json=request_data)
    recovered_response = request(app, 'POST', '/api/suggestions', json=request_data)

    assert accepted.status_code == 200
    assert duplicate.status_code == 502
    assert duplicate.json()['diagnostics']['failure_reason'] == 'repeated_response'
    assert duplicate.json()['diagnostics']['duplicate_source'] == 'previous_unsubmitted_draft'
    assert len(duplicate.json()['diagnostics']['request_id']) == 32
    assert duplicate.json()['diagnostics']['duration_ms'] >= 0
    assert recovered_response.status_code == 200
    assert recovered_response.json()['original_response'] == recovered
    assert llm.calls == 4  # one normal call, one controlled retry, then a fresh request
    retry_prompt = llm.prompts[2][-1]['content']
    assert 'cambia el enfoque conversacional de forma sustantiva' in retry_prompt
    assert private_incoming not in caplog.text


def test_missing_context_analysis_releases_backend_request_state_and_next_request_recovers(tmp_path, caplog):
    class FlakyAnalysis(SequenceLLM):
        def __init__(self):
            super().__init__(['A fresh synthetic reply that answers the test question.'])
            self.analysis_calls = 0

        async def analyze(self, messages):
            self.analysis_calls += 1
            if self.analysis_calls <= 2:
                return []
            return await super().analyze(messages)

    app = build(tmp_path, FlakyAnalysis())
    private_incoming = 'Synthetic analysis recovery marker 72c1: what do you think?'
    request_data = {
        'message': private_incoming, 'target_message': private_incoming,
        'target_message_id': 'analysis-recovery-target', 'conversation_id': 'synthetic-analysis-recovery',
        'interlocutor': 'Synthetic analysis visitor', 'configured_mode': 'manual',
        'generation_trigger': 'manual', 'target_is_incoming': True,
    }

    rejected = request(app, 'POST', '/api/suggestions', json=request_data)
    recovered = request(app, 'POST', '/api/suggestions', json=request_data)

    assert rejected.status_code == 502
    assert rejected.json()['diagnostics']['failure_reason'] == 'missing_context_analysis'
    assert rejected.json()['diagnostics']['stage'] == 'analysis'
    assert rejected.json()['diagnostics']['attempts'] == 2
    assert recovered.status_code == 200
    assert recovered.json()['original_response'] == 'A fresh synthetic reply that answers the test question.'
    assert app.state.memory.list_notes(app.state.test_account_id, 'Synthetic analysis visitor') == []
    assert private_incoming not in caplog.text


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
