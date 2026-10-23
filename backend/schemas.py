from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Literal


class SuggestRequest(BaseModel):
    configured_mode: Literal["auto", "manual", "off"] = "manual"
    generation_trigger: Literal["automatic", "manual"] = "manual"
    message: str = Field(default="", min_length=1, max_length=4000)
    target_message: str | None = Field(default=None, max_length=4000)
    target_message_id: str | None = Field(default=None, max_length=240)
    conversation_id: str | None = Field(default=None, max_length=160)
    target_is_incoming: bool = True
    interlocutor: str | None = Field(default=None, max_length=120)
    interlocutor_alias: str | None = Field(default=None, max_length=120)
    context: str = Field(default="", max_length=12000)
    conversation_history: str | None = Field(default=None, max_length=12000)
    additional_context: str = Field(default="", max_length=4000)
    dom_extracted_message_count: int = Field(default=0, ge=0, le=10000)
    dom_extracted_incoming_count: int = Field(default=0, ge=0, le=10000)
    dom_extracted_outgoing_count: int = Field(default=0, ge=0, le=10000)
    dom_extracted_unclassified_count: int = Field(default=0, ge=0, le=10000)
    client_context_window: int = Field(default=100, ge=1, le=100)
    client_context_truncated_by_window: bool = False
    client_context_truncated_by_characters: bool = False
    language: str | None = Field(default=None, max_length=20)
    detected_language: str | None = Field(default=None, max_length=20)
    count: int = Field(default=1, ge=1, le=1)

    @model_validator(mode="before")
    @classmethod
    def normalize_generation_contract(cls, values):
        if not isinstance(values, dict):
            return values
        values = dict(values)
        for canonical, legacy in (("target_message", "message"), ("conversation_history", "context"), ("interlocutor_alias", "interlocutor")):
            new, old = values.get(canonical), values.get(legacy)
            if new is not None and old not in (None, ""):
                same = new == old
                if canonical == "interlocutor_alias" and isinstance(new, str) and isinstance(old, str):
                    same = " ".join(new.casefold().split()) == " ".join(old.casefold().split())
                if not same:
                    raise ValueError("Campos canónicos y heredados contradictorios: " + canonical)
        values["message"] = values.get("target_message") or values.get("message") or ""
        values["target_message"] = values.get("target_message") or values["message"]
        values["context"] = values.get("conversation_history") if values.get("conversation_history") is not None else values.get("context", "")
        values["conversation_history"] = values["context"]
        values["interlocutor"] = values.get("interlocutor_alias") if values.get("interlocutor_alias") is not None else values.get("interlocutor")
        values["interlocutor_alias"] = values["interlocutor"]
        return values


class NoteInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=1000)


class NoteOut(BaseModel):
    id: int
    text: str
    created_at: str
    updated_at: str


class TranslationRequest(BaseModel):
    original_response: str = Field(min_length=1, max_length=4000)
    language: str = Field(min_length=2, max_length=40)
    retry_token: str | None = Field(default=None, max_length=80)


class TranslationRetryResponse(BaseModel):
    available: bool
    spanish_translation: str | None = None
    failure_reason: str | None = None
    failure_message: str | None = None
    http_status: int | None = None
    retry_token: str | None = None
    attempts: int = 0
    failure_stage: str | None = None


class KnowledgeSourceDiagnostic(BaseModel):
    local_file_exists: bool
    shared_file_exists: bool
    loaded_from: str
    loaded: bool
    included_in_prompt: bool


class SuggestionDiagnostics(BaseModel):
    generation_attempts: int = 1
    rejection_history: list[str] = Field(default_factory=list)
    review_format_repairs: int = 0
    heuristic_overrides: list[str] = Field(default_factory=list)
    draft_repairs: list[str] = Field(default_factory=list)
    translation_retry_token: str | None = None
    translation_attempts: int = 0
    translation_failure_stage: str | None = None
    knowledge_sources: dict[str, KnowledgeSourceDiagnostic]
    memory_available: bool
    memory_note_count: int
    detected_language: str
    language_rule: str
    language_confidence: float
    context_message_count: int
    last_incoming_found: bool
    context_sent: bool
    response_count: int
    response_language_codes: list[str]
    language_retry_used: bool
    dom_extracted_message_count: int
    dom_extracted_incoming_count: int
    dom_extracted_outgoing_count: int
    dom_extracted_unclassified_count: int
    context_input_message_count: int
    context_input_chars: int
    context_included_chars: int
    client_context_window: int
    context_truncation_reason: list[str]
    estimated_prompt_tokens: int
    configured_model_context_tokens: int
    configured_output_tokens: int
    lm_studio_result: str
    translation_status: str
    translation_failure_reason: str | None = None
    translation_http_status: int | None = None
    translation_retry_available: bool = False


class SuggestResponse(BaseModel):
    configured_mode: str = "manual"
    generation_trigger: str = "manual"
    active_profile_id: str | None = None
    api_version: str = "1.0"
    conversation_id: str | None = None
    target_message_id: str | None = None
    generation_id: str
    language: str
    original_response: str
    spanish_translation: str | None = None
    interlocutor: str | None
    memory_available: bool
    notice: str | None = None
    diagnostics: SuggestionDiagnostics | None = None
