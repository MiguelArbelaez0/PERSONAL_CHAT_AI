"""Exact synthetic regressions for the three remaining closure blockers."""
import json
from backend.grounding import verified_wellbeing_exchange
from backend.translation import translate_and_review
from test_app import build, request
from test_real_cases import SequenceLLM
from test_translation import TranslationClient, run

FR = "Bonsoir, tu vas bien ? J'aimerais apprendre à mieux te connaître."
PT_SOURCE = "Oi! Tudo bem, obrigado por querer conhecer melhor. Fico feliz em conversar com você."
PT_INCOMING = "Oi, tudo bem? Gostaria de conhecer você melhor."


def verdict(**extra):
    return {"supported": True, "perspective_consistent": True, "answers_target": True,
            "repeated_idea": False, "repetitive_question": False, "personal_claims": [], **extra}


class Approving(SequenceLLM):
    async def review_generation(self, messages):
        return [json.dumps(verdict())]


def test_real_emoji_does_not_support_viewer_taste_even_when_reviewer_omits_claim(tmp_path):
    llm=Approving(["Bonjour ! Tu as un bon goût pour les choses simples."]*2)
    r=request(build(tmp_path,llm),'POST','/api/suggestions',json={'message':'😏','context':'- Interlocutor: Bonjour, comment vas-tu ?','interlocutor':'Synthetic-Emoji'})
    assert r.status_code==502 and r.json()['error']['reason_code']=='unsupported_claim'


def test_real_favorite_color_guess_is_not_evidence_but_honest_uncertainty_is_allowed(tmp_path):
    llm=Approving(["I'd say deep blues — calm, steady, and a little mysterious.", "I don't know your favorite color yet. Would you like to tell me?"])
    r=request(build(tmp_path,llm),'POST','/api/suggestions',json={'message':'Which color do I like?','interlocutor':'Synthetic-Unknown'})
    assert r.status_code==200 and r.json()['original_response'].startswith("I don't know")
    assert llm.calls==2


def test_real_french_courtesies_are_not_contextual_claims():
    for draft in ("Bonsoir ! Oui, je vais bien, merci. Content de te connaître un peu mieux.", "Bonsoir ! Je vais bien, merci. Content de mieux te connaître."):
        assert verified_wellbeing_exchange(draft,FR)
        assert not verified_wellbeing_exchange(draft+" J'ai passé la journée avec toi.",FR)


class PortugueseRetry(TranslationClient):
    async def translate(self, messages):
        self.translate_calls+=1
        self.messages.append(messages)
        resolved='querer me conhecer melhor' in messages[-1]['content']
        text=('¡Hola! Todo bien, gracias por querer conocerme mejor. Me alegra conversar contigo.'
              if self.translate_calls>2 and resolved else
              '¡Hola! Todo bien, gracias por querer conocerte mejor. Me alegra conversar contigo.')
        return [json.dumps({'translation':text,'faithful':True,'adds_or_omits_information':False})]


def test_real_portuguese_manual_retry_recovers_cached_ellipsis_without_changing_original():
    client=PortugueseRetry([])
    # Replay the cached failure recorded before the fix, not a newly generated
    # failure that the new repair can now recover on its first attempt.
    cached={'reason':'perspective_mismatch','candidate':'Gracias por querer conocerte mejor.',
            'issues':[{'category':'perspective','source_quote':PT_SOURCE,'translation_quote':'conocerte'}],
            'source_context':PT_INCOMING}
    recovered=run(translate_and_review(client,original=PT_SOURCE,language='pt',manual_retry=True,retry_state=cached))
    assert recovered.text and 'conocerme mejor' in recovered.text
    assert cached['source_context']==PT_INCOMING
    assert PT_SOURCE=="Oi! Tudo bem, obrigado por querer conhecer melhor. Fico feliz em conversar com você."


def test_speaker_scoped_preferences_allow_memory_but_never_cross_owner_facts():
    from backend.grounding import review_rejection
    from backend.evidence import viewer_evidence
    incoming='Which color do I like?'
    notes=[{'text':'Explicit viewer preference: favorite color is cobalt-731.'}, {'text':'Owner: I prefer red.'}]
    prefs=viewer_evidence(incoming,'',notes,preferences=True)
    claim={'claim':'Viewer likes cobalt-731','subject':'other_person','kind':'preference','source':'notes','evidence_quote':notes[0]['text']}
    answer=[json.dumps(verdict(personal_claims=[claim]))]
    owner={'target':incoming,'history':'','notes':'Owner: I prefer red.'}
    assert review_rejection(answer,evidence=owner,other_evidence=prefs,preference_evidence=prefs,require_viewer_preference=True)==''
    claim['evidence_quote']=notes[1]['text']
    assert review_rejection([json.dumps(verdict(personal_claims=[claim]))],evidence=owner,preference_evidence=prefs,require_viewer_preference=True)=='unsupported_claim'
    claim['subject']='owner';claim['evidence_quote']=notes[0]['text']
    assert review_rejection([json.dumps(verdict(personal_claims=[claim]))],evidence=owner,preference_evidence=prefs)=='unsupported_claim'


def test_preference_questions_guesses_and_invitations_are_not_factual_assertions():
    from backend.evidence import viewer_preference_required,viewer_evidence
    assert not viewer_preference_required('Do you like jazz?', 'What should we talk about?')
    assert not viewer_preference_required("I'd say blue, but it's only a guess.", 'Guess my favorite color!')
    assert not viewer_preference_required("I don't know your favorite color. Would you like to tell me?", 'Which color do I like?')
    assert viewer_preference_required('You love jazz.', 'Hello!')
    assert viewer_preference_required("I'd say blue.", 'Which color do I like?')
    prefs=viewer_evidence('Which color do I like?', '- Usuario: I like blue.', [],preferences=True)
    assert not any(prefs.values())
    assert 'jazz' in viewer_evidence('I love jazz. What about you?', '',[],preferences=True)['target']


def test_evidenced_preference_with_reviewer_citation_reaches_api(tmp_path):
    class Reviewed(SequenceLLM):
        async def review_generation(self,messages):
            return [json.dumps(verdict(personal_claims=[{'claim':'Viewer likes cobalt-731','subject':'other_person','kind':'preference','source':'notes','evidence_quote':'Explicit viewer preference: favorite color is cobalt-731.'}]))]
    llm=Reviewed(['You like cobalt-731.'])
    app=build(tmp_path,llm)
    app.state.memory.add_note('Synthetic-Notes','Explicit viewer preference: favorite color is cobalt-731.')
    r=request(app,'POST','/api/suggestions',json={'message':'Which color do I like?','interlocutor':'Synthetic-Notes'})
    assert r.status_code==200 and r.json()['original_response']=='You like cobalt-731.'


def test_resolved_translation_never_adds_a_role_without_the_incoming_evidence():
    from backend.translation import resolved_translation_source
    assert 'querer me conhecer melhor' in resolved_translation_source(PT_SOURCE,PT_INCOMING)
    assert resolved_translation_source(PT_SOURCE,'Oi, tudo bem?')==PT_SOURCE
    explicit='Obrigado por querer conhecer você melhor.'
    assert resolved_translation_source(explicit,PT_INCOMING)==explicit
    named='Obrigado por querer conhecer melhor João.'
    assert resolved_translation_source(named,PT_INCOMING)==named


def test_french_content_and_repetition_checks_still_apply_to_courtesies():
    from backend.grounding import review_rejection
    assert review_rejection([json.dumps(verdict(repeated_idea=True))],verified_courtesy=True)=='repeated_idea'
    assert review_rejection([json.dumps(verdict(perspective_consistent=False))],verified_courtesy=True)=='perspective_mismatch'
    assert not verified_wellbeing_exchange('Bonsoir ! Je vais bien, merci. Je suis allé au cinéma.', FR)


def test_viewer_claim_does_not_satisfy_required_owner_activity_evidence():
    from backend.grounding import review_rejection
    note='Explicit viewer preference: favorite color is cobalt-731.'
    claim={'claim':'Viewer likes cobalt-731','subject':'other_person','kind':'preference','source':'notes','evidence_quote':note}
    scopes={'target':'','history':'','notes':note}
    assert review_rejection([json.dumps(verdict(personal_claims=[claim]))],evidence={'target':'','history':'','notes':'Owner: I work at home.'},other_evidence=scopes,preference_evidence=scopes,require_evidence=True)=='unsupported_claim'


def test_portuguese_local_repair_requires_context_and_full_semantic_approval():
    bad='¡Hola! Todo bien, gracias por querer conocerte mejor. Me alegra conversar contigo.'
    client=TranslationClient([json.dumps({'translation':bad,'faithful':True})])
    result=run(translate_and_review(client,original=PT_SOURCE,language='pt',source_context=PT_INCOMING))
    assert result.text and 'conocerme' in result.text and client.review_calls==1
    refused=TranslationClient([json.dumps({'translation':bad,'faithful':True})],reviewed=[json.dumps({'meaning_preserved':False,'no_added_or_omitted_information':False})])
    assert run(translate_and_review(refused,original=PT_SOURCE,language='pt',source_context=PT_INCOMING)).text is None
    unknown=TranslationClient([json.dumps({'translation':bad,'faithful':True})])
    assert 'conocerte' in run(translate_and_review(unknown,original=PT_SOURCE,language='pt')).text


def test_target_and_reply_pronouns_have_explicit_opposite_bindings():
    from backend.roles import address_frame
    frame=address_frame('Which color do I like?')
    assert frame['target_first_person']=='other_person'
    assert frame['reply_first_person']=='account_owner'


def test_manual_preference_shorthand_is_preserved_but_owner_target_is_not_viewer_evidence():
    from backend.evidence import viewer_evidence,preference_anchor
    prefs=viewer_evidence('Your favorite color is red.', '',[{'text':'Favorite color: cobalt-731.'}],preferences=True)
    assert prefs['target']=='' and 'cobalt-731' in prefs['notes']
    assert viewer_evidence("I don't like jazz", '', [],preferences=True)['target']
    assert not preference_anchor('Viewer likes jazz', "I don't like jazz")
    assert preference_anchor('Viewer dislikes jazz', "I don't like jazz")


def test_actual_http_startup_and_restart_use_only_ephemeral_ports_and_synthetic_copies(tmp_path):
    from backend.memory import MemoryStore
    from backend.profiles import ProfileStore
    from tools.probe_isolated_http import probe
    from pathlib import Path
    copies=tmp_path/'copies';copies.mkdir()
    MemoryStore(copies/'personal_chat_ai.sqlite3')
    ProfileStore(copies/'personalities.sqlite3')
    output=tmp_path/'http.json'
    probe(Path(__file__).resolve().parents[1],copies,output)
    result=json.loads(output.read_text())
    assert result['original_snapshot_matches'] and result['restart_persistence']
    assert result['copied_inputs_unchanged'] and all(port!=8765 for port in result['ports'])


def test_french_api_keeps_both_real_courtesies_despite_false_reviewer_verdict(tmp_path):
    class FalseCourtesy(SequenceLLM):
        async def review_generation(self,messages):
            return [json.dumps(verdict(supported=False))]
    for index,draft in enumerate(('Bonsoir ! Oui, je vais bien, merci. Content de te connaître un peu mieux.', 'Bonsoir ! Je vais bien, merci. Content de mieux te connaître.')):
        llm=FalseCourtesy([draft]*2)
        r=request(build(tmp_path/str(index),llm),'POST','/api/suggestions',json={'message':FR,'interlocutor':'Synthetic-French'})
        assert r.status_code==200 and r.json()['original_response']==draft and llm.calls==1


def test_question_after_topic_transition_cannot_be_misclassified_as_viewer_fact():
    from backend.grounding import review_rejection
    from backend.evidence import viewer_preference_required
    draft="Sure, let's dive into some music — what's your favorite genre or artist right now?"
    claim={'claim':'Other person has a favorite genre','subject':'other_person','kind':'preference','source':'target','evidence_quote':"what's your favorite genre or artist right now"}
    assert not viewer_preference_required(draft, "Let's talk about music instead.")
    assert review_rejection([json.dumps(verdict(personal_claims=[claim]))],evidence={'target':"Let's talk about music instead.",'history':'','notes':''},draft=draft)==''
    factual="You like jazz — what's your favorite genre or artist right now?"
    assert viewer_preference_required(factual, 'Hi!')
    assert review_rejection([json.dumps(verdict(personal_claims=[claim]))],evidence={'target':'Hi!','history':'','notes':''},draft=factual,require_viewer_preference=True)=='unsupported_claim'


def test_preference_question_exception_never_accepts_invalid_source_contract():
    from backend.grounding import review_rejection
    draft="What's your favorite genre?"
    claim={'claim':'Viewer has a preference','subject':'other_person','kind':'preference','source':'draft','evidence_quote':"What's your favorite genre"}
    assert review_rejection([json.dumps(verdict(personal_claims=[claim]))],evidence={'target':'Hi!'},draft=draft)=='invalid_grounding_review'


def test_observed_actually_do_not_know_is_not_a_preference_assertion(tmp_path):
    from backend.evidence import viewer_preference_required
    draft="I actually don't know what color you like, but I'm glad you asked."
    llm=Approving([draft]*2)
    r=request(build(tmp_path,llm),'POST','/api/suggestions',json={'message':'Which color do I like?','interlocutor':'Synthetic-Honest'})
    assert r.status_code==200 and r.json()['original_response']==draft
    assert not viewer_preference_required(draft,'Which color do I like?')
    assert viewer_preference_required("I don't know. You love jazz.", 'Hi!')


def test_tag_question_does_not_hide_a_viewer_preference_assertion():
    from backend.evidence import viewer_preference_required,question_citation
    assert viewer_preference_required("You love jazz, don't you?", 'Hi!')
    assert not question_citation("You love jazz, don't you?", "You love jazz, don't you")
    assert not viewer_preference_required('Do you like jazz?', 'Hi!')
    assert viewer_preference_required('Blue — how about you?', 'Which color do I like?')


def test_natural_preference_questions_in_all_four_languages_remain_questions():
    from backend.evidence import viewer_preference_required,question_citation
    for draft,quote in (
        ("Sure, let's talk, do you prefer jazz, rock or blues?", 'do you prefer jazz, rock or blues'),
        ('Je suis curieux, tu aimes le jazz ?', 'tu aimes le jazz'),
        ('Cuéntame, te gusta el jazz?', 'te gusta el jazz'),
        ('Quero saber, você gosta de jazz?', 'você gosta de jazz'),
    ):
        assert not viewer_preference_required(draft, 'Hi!')
        assert question_citation(draft,quote)
    assert viewer_preference_required("Tu aimes le jazz, n'est-ce pas?", 'Salut !')
