"""Local LM Studio structured output contracts; validation remains independent."""


def object_schema(properties):
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def array_schema(items, maximum=3, minimum=0):
    return {"type": "array", "items": items, "minItems": minimum, "maxItems": maximum}


BOOLEAN = {"type": "boolean"}
TEXT = {"type": "string"}
CHECKS = object_schema({key: BOOLEAN for key in (
    "on_topic", "correct_language", "perspective_consistent", "unrequested_money",
    "unsupported_adult_or_domination", "unsupported_claim",
)})
OUTPUT_SCHEMAS = {
    "analysis": object_schema({
        **{key: {"type": "string", "minLength": 1} for key in
           ("current_topic", "message_meaning", "likely_intent", "observed_tone")},
        "intent_confidence": {"type": "number", "minimum": 0, "maximum": 1},
        **{key: array_schema(TEXT, 12) for key in
           ("references", "active_topics", "relevant_memory", "explicit_facts", "inferences", "unknowns")},
        "money_or_tip_relevant": BOOLEAN,
        "adult_or_domination_supported": BOOLEAN,
    }),
    "generation": object_schema({"responses": array_schema(TEXT, 1, 1), "checks": array_schema(CHECKS, 1, 1)}),
    "grounding_review": object_schema({
        **{key: BOOLEAN for key in ("supported", "perspective_consistent", "answers_target", "repeated_idea", "repetitive_question")},
        "personal_claims": array_schema(object_schema({
            "claim": TEXT, "subject": {"type":"string", "enum":["owner","other_person"]},
            "kind": {"type":"string", "enum":["preference","activity","feeling","memory","other"]}, "source": {"type": "string", "enum": ["target", "history", "notes"]}, "evidence_quote": TEXT,
        })),
    }),
    "translation": object_schema({"translation": TEXT, "faithful": BOOLEAN, "adds_or_omits_information": BOOLEAN}),
    "translation_review": object_schema({
        **{key: BOOLEAN for key in ("meaning_preserved", "no_added_or_omitted_information", "translation_is_spanish")},
        "issues": array_schema(object_schema({
            "category": {"type": "string", "enum": ["omission", "addition", "perspective", "negation", "speech_act", "meaning", "tone"]},
            "source_quote": TEXT, "translation_quote": TEXT,
        })),
    }),
}
