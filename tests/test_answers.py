from backend.answers import distinct_answers, parse_context_analysis, parse_generation, parse_translation, parse_translation_review, split_alternatives


def test_numbered_single_completion_splits_into_alternatives():
    result = split_alternatives("1. Primera opción.\n2) Segunda opción.\n   Continúa aquí.\n3. Tercera opción.")
    assert result == ["Primera opción.", "Segunda opción. Continúa aquí.", "Tercera opción."]


def test_identical_and_near_identical_drafts_are_removed_without_padding():
    result = distinct_answers([
        "Keep tipping; every token brings me closer to the goal.",
        "Keep tipping, each token brings me closer to the goal!",
        "Show me how badly you want it, daddy.",
    ])
    assert result == [
        "Keep tipping; every token brings me closer to the goal.",
        "Show me how badly you want it, daddy.",
    ]


def test_empty_and_duplicate_results_are_not_fabricated_into_three():
    assert distinct_answers(["", "1. Solo respuesta", "Solo respuesta!"]) == ["Solo respuesta"]


def test_very_different_formulations_are_preserved():
    options = ["Wait for the goal, then I will give you a show.", "Keep the tips coming; make me lose control."]
    assert distinct_answers(options) == options


def test_json_contract_and_accidental_text_around_json_are_parsed():
    assert split_alternatives('{"responses": ["Primera completa", "Segunda completa"]}') == [
        "Primera completa", "Segunda completa"
    ]
    assert split_alternatives('Aquí va:\n```json\n{"responses":["Una", "Dos"]}\n```') == ["Una", "Dos"]


def test_generation_parser_preserves_structured_analysis_and_review_checks():
    raw = '{"analysis":{"likely_intent":"share a story","intent_confidence":0.4},"responses":["Reply one", "Reply two"],"checks":[{"on_topic":true},{"on_topic":true}]}'
    parsed = parse_generation(raw)
    assert parsed["format"] == "json"
    assert parsed["responses"] == ["Reply one", "Reply two"]
    assert parsed["analysis"]["intent_confidence"] == 0.4
    assert len(parsed["checks"]) == 2


def test_context_analysis_parser_normalizes_qwen_list_and_string_shapes():
    raw = '{"analysis":{"current_topic":["casual story","French"],"message_meaning":"she describes an event",' \
          '"likely_intent":["share","invite a response"],"intent_confidence":"65%",' \
          '"references":"previous conversation not included","observed_tone":["playful"],' \
          '"active_topics":"anecdote","relevant_memory":null,"explicit_facts":["the event is mentioned"],' \
          '"inferences":[],"unknowns":"cause is unknown","money_or_tip_relevant":"false",' \
          '"adult_or_domination_supported":"false"}}'
    parsed = parse_context_analysis("Analysis follows:\n" + raw)
    assert parsed["current_topic"] == "casual story; French"
    assert parsed["likely_intent"] == "share; invite a response"
    assert parsed["intent_confidence"] == 0.65
    assert parsed["references"] == ["previous conversation not included"]
    assert parsed["active_topics"] == ["anecdote"]
    assert parsed["relevant_memory"] == []
    assert parsed["explicit_facts"] == ["the event is mentioned"]
    assert parsed["unknowns"] == ["cause is unknown"]
    assert parsed["money_or_tip_relevant"] is False
    assert parsed["adult_or_domination_supported"] is False


def test_context_analysis_parser_rejects_unrecognized_output():
    assert parse_context_analysis("I think the conversation is playful.") is None
    assert parse_context_analysis('{"responses":["one","two"]}') is None


def test_context_analysis_parser_accepts_required_fields_at_json_root():
    raw = '{"current_topic":"an anecdote","message_meaning":"she shares what happened",' \
          '"likely_intent":"continue the conversation","intent_confidence":0.7,"references":[],' \
          '"observed_tone":"casual","active_topics":["anecdote"],"relevant_memory":[],' \
          '"explicit_facts":[],"inferences":[],"unknowns":[],"money_or_tip_relevant":false,' \
          '"adult_or_domination_supported":false}'
    assert parse_context_analysis(raw)["current_topic"] == "an anecdote"


def test_translation_parser_requires_fidelity_flags_and_nonempty_text():
    assert parse_translation('Preface {"translation":"Me alegra verte 😊","faithful":true,"adds_or_omits_information":false}') == "Me alegra verte 😊"
    assert parse_translation('{"translation":"","faithful":true,"adds_or_omits_information":false}') is None
    assert parse_translation('{"translation":"Me alegra verte","faithful":false,"adds_or_omits_information":true}') is None
    assert parse_translation_review('{"meaning_preserved":true,"no_added_or_omitted_information":true}') is True
    assert parse_translation_review('{"meaning_preserved":true,"no_added_or_omitted_information":false}') is False


def test_invalid_json_uses_recognizable_numbered_fallback_only():
    assert split_alternatives('{"responses":[\n1. Primera completa\n2) Segunda completa') == [
        "Primera completa", "Segunda completa"
    ]
    assert split_alternatives("texto arbitrario sin estructura") == ["texto arbitrario sin estructura"]


def test_empty_and_truncated_outputs_do_not_become_two_answers():
    assert split_alternatives("") == []
    assert split_alternatives('{"responses":["Primera completa", "') == ['{"responses":["Primera completa", "']


def test_small_shared_vocabulary_is_not_enough_to_reject_natural_alternatives():
    options = [
        "I like your energy; tell me what you have in mind.",
        "I like your energy; tell me what you would like to do together tonight.",
    ]
    assert distinct_answers(options) == options


def test_punctuation_and_formatting_differences_are_duplicates():
    assert distinct_answers(["1. That's lovely!", "2) THAT'S lovely."]) == ["That's lovely!"]


def test_almost_identical_answers_are_removed():
    assert distinct_answers([
        "That sounds wonderful, tell me more about it.",
        "That sounds wonderful! Tell me more about it.",
    ]) == ["That sounds wonderful, tell me more about it."]


def test_analysis_schema_requires_nonempty_topic_instead_of_empty_model_list():
    from backend.output_schemas import OUTPUT_SCHEMAS
    from backend.main import _analysis_rejection
    from backend.answers import parse_context_analysis
    import json
    schema = OUTPUT_SCHEMAS['analysis']
    assert schema['properties']['current_topic'] == {'type':'string','minLength':1}
    fields = {key: [] for key in ('references','active_topics','relevant_memory','explicit_facts','inferences','unknowns')}
    fields.update(current_topic=[],message_meaning='Thanks',likely_intent='Thank',observed_tone='Polite',intent_confidence=1,money_or_tip_relevant=False,adult_or_domination_supported=False)
    assert _analysis_rejection(parse_context_analysis(json.dumps(fields))) == 'invalid_context_analysis_format'
    fields['current_topic']='Gratitude'
    assert _analysis_rejection(parse_context_analysis(json.dumps(fields))) == ''
