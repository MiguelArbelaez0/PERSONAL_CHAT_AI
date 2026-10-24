import logging
import json
import math
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.config import Settings, settings
from backend.answers import distinct_answers, is_valid_response_json, parse_context_analysis, parse_generation, split_alternatives
from backend.knowledge import read_knowledge_with_sources
from backend.language import classify_language, detect_language
from backend.lm_studio import LMStudioClient, LMStudioError
from backend.memory import MemoryStore, normalize_alias
from backend.profiles import AccountInput, ProfileInput, ProfileStore
from backend.validation import RecentDrafts, response_rejection, remove_unsupported_clauses, owner_notes
from backend.grounding import review_messages, review_rejection, verified_wellbeing_exchange
from backend.evidence import viewer_preference_required, viewer_evidence
from backend.errors import PipelineFailure, transport_failure
from backend.request_limits import RequestLimitsMiddleware
from backend.roles import remove_reversed_vocative
from backend.validation import response_duplicate_source
from backend.prompt import build_context_analysis_messages, build_suggestion_messages, _bounded_notes
from backend.schemas import NoteInput, SuggestRequest, SuggestResponse, SuggestionDiagnostics, TranslationRequest, TranslationRetryResponse
from backend.translation import translate_and_review, translation_failure_message, TranslationRetries

logger = logging.getLogger(__name__)


def _estimate_prompt_tokens(messages: list[dict[str, str]]) -> int:
    """Conservative planning estimate; LM Studio's loaded tokenizer is not exposed by /v1/models."""
    text = "\n".join(item.get("content", "") for item in messages)
    non_ascii = sum(ord(char) > 127 for char in text)
    ascii_chars = len(text) - non_ascii
    rough = math.ceil(ascii_chars / 3) + non_ascii
    return math.ceil(rough * 1.15) + 32


def _drop_oldest_context_line(context: str) -> str:
    lines = context.splitlines()
    return "\n".join(lines[1:]).strip() if len(lines) > 1 else ""


def _message_row_count(context: str) -> int:
    return sum(1 for line in context.splitlines() if line.lstrip().startswith(("- Interlocutor", "- Usuario")))


def _analysis_rejection(analysis: dict | None) -> str:
    if not isinstance(analysis, dict):
        return "missing_context_analysis"
    required = {
        "current_topic", "message_meaning", "likely_intent", "intent_confidence", "references",
        "observed_tone", "active_topics", "relevant_memory", "explicit_facts", "inferences", "unknowns",
        "money_or_tip_relevant", "adult_or_domination_supported",
    }
    if not required.issubset(analysis):
        return "incomplete_context_analysis"
    confidence = analysis.get("intent_confidence")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        return "invalid_context_confidence"
    if any(not isinstance(analysis.get(key), list) for key in ("references", "active_topics", "relevant_memory", "explicit_facts", "inferences", "unknowns")):
        return "invalid_context_analysis_format"
    if not isinstance(analysis.get("money_or_tip_relevant"), bool) or not isinstance(analysis.get("adult_or_domination_supported"), bool):
        return "invalid_context_analysis_format"
    if any(not isinstance(analysis.get(key), str) or not analysis[key].strip() for key in ("current_topic", "message_meaning", "likely_intent", "observed_tone")):
        return "invalid_context_analysis_format"
    for key in ("references", "active_topics", "relevant_memory", "explicit_facts", "inferences", "unknowns"):
        if any(not isinstance(item, str) for item in analysis[key]):
            return "invalid_context_analysis_format"
    return ""


def _context_review_rejection(generation: dict) -> str:
    checks = generation.get("checks")
    check_fields = {"on_topic", "correct_language", "perspective_consistent", "unrequested_money", "unsupported_adult_or_domination", "unsupported_claim"}
    if not isinstance(checks, list) or len(checks) != 1 or any(
        not isinstance(item, dict) or not check_fields.issubset(item)
        or any(not isinstance(item.get(key), bool) for key in check_fields)
        for item in checks
    ):
        return "invalid_context_review_format"
    if any(not item["on_topic"] for item in checks):
        return "contextually_irrelevant"
    if any(not item["correct_language"] for item in checks):
        return "review_language_mismatch"
    if any(not item["perspective_consistent"] for item in checks):
        return "perspective_mismatch"
    if any(item["unrequested_money"] for item in checks):
        return "unrequested_money"
    if any(item["unsupported_adult_or_domination"] for item in checks):
        return "unsupported_adult_or_domination"
    if any(item["unsupported_claim"] for item in checks):
        return "unsupported_claim"
    return ""


def create_app(config: Settings = settings, llm=None, memory=None) -> FastAPI:
    logging.basicConfig(level=getattr(logging, config.log_level, logging.INFO))
    client = llm or LMStudioClient(config.lm_studio_base_url, config.lm_studio_model, config.lm_studio_timeout, config.lm_studio_output_tokens)
    store = memory or MemoryStore(config.database_path, config.memory_max_notes)
    profiles = ProfileStore(config.database_path)
    recent_drafts = RecentDrafts()
    translation_retries = TranslationRetries()

    @asynccontextmanager
    async def lifespan(app):
        yield

    app = FastAPI(title="PERSONAL_CHAT_AI", version="1.2.0", lifespan=lifespan)
    app.state.llm, app.state.memory, app.state.profiles = client, store, profiles
    app.add_middleware(RequestLimitsMiddleware)
    # Content-script fetch requests carry the Stripchat page origin (not the extension origin).
    app.add_middleware(CORSMiddleware, allow_origin_regex=r"(?:chrome-extension://[a-p]{32}|https://(?:[a-z0-9-]+\.)*stripchat\.com)", allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["content-type"])

    def error_code(status_code: int, detail: object) -> tuple[str, str]:
        text = detail if isinstance(detail, str) else ""
        lowered = text.casefold()
        if status_code == 422:
            return "invalid_request", "La solicitud no cumple el formato esperado. Revisa el mensaje y vuelve a intentarlo."
        if status_code == 413:
            return "request_too_large", text or "La solicitud supera el límite configurado."
        if status_code == 502:
            return "generation_validation_failed", text or "LM Studio no devolvió una respuesta que superara la validación."
        if status_code == 503:
            if "devolvió una respuesta no válida" in lowered:
                return "lm_studio_invalid_response", text
            if "lm studio devolvió http" in lowered:
                return "lm_studio_http_error", text
            if "lm studio" in lowered:
                return "lm_studio_unavailable", text
            return "backend_unavailable", text or "El servicio local no está disponible."
        if status_code == 504:
            return "lm_studio_timeout", text or "LM Studio agotó el tiempo de espera."
        if status_code == 404:
            return "not_found", text or "No se encontró el recurso solicitado."
        if status_code == 409:
            if "onboarding_required" in lowered:
                return "onboarding_required", "Confirma una cuenta y completa su configuración antes de generar respuestas."
            if "account_required" in lowered:
                return "account_required", "Indica la cuenta de modelo para esta operación."
            if "account_unconfirmed" in lowered:
                return "account_unconfirmed", "Confirma la identidad de la cuenta antes de usar sus datos."
            return "state_conflict", text or "La operación no es válida en el estado actual."
        return "http_error", text or f"La solicitud falló (HTTP {status_code})."

    @app.exception_handler(HTTPException)
    async def handle_http_error(request: Request, exc: HTTPException):
        code, message = error_code(exc.status_code, exc.detail)
        reason = exc.reason if isinstance(exc, PipelineFailure) else code
        stage = exc.stage if isinstance(exc, PipelineFailure) else "request"
        attempts = exc.attempts if isinstance(exc, PipelineFailure) else 0
        return JSONResponse(status_code=exc.status_code, content={
            "api_version": "1.0", "detail": message,
            "error": {"code": code, "reason_code": reason, "category": stage, "message": message},
            "diagnostics": {"http_status": exc.status_code, "source": "backend", "failure_reason": reason,
                            "stage": stage, "attempts": attempts,
                            **({"duplicate_source": exc.duplicate_source} if isinstance(exc, PipelineFailure) and exc.duplicate_source else {})},
        }, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(request: Request, exc: RequestValidationError):
        invalid_json = any(item.get("type") == "json_invalid" for item in exc.errors())
        code = "invalid_json" if invalid_json else "invalid_request"
        message = "El backend no pudo interpretar el JSON de la solicitud." if invalid_json else "La solicitud no cumple el formato esperado. Revisa el mensaje y vuelve a intentarlo."
        issues = [{
            "path": [str(part)[:80] for part in item.get("loc", [])[:8]],
            "reason": str(item.get("type", "validation_error"))[:80],
        } for item in exc.errors()[:12]]
        return JSONResponse(status_code=422, content={
            "api_version": "1.0", "detail": message,
            "error": {"code": code, "category": "validation", "message": message},
            "diagnostics": {"http_status": 422, "source": "backend", "issues": issues},
        })

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "service": "personal-chat-ai", "host": config.host, "port": config.port}

    @app.get("/api/diagnostics/lm-studio")
    async def diagnostics():
        try:
            models = await client.models()
            return {"available": True, "models": models, "configured_model": config.lm_studio_model or None}
        except LMStudioError as exc:
            return {"available": False, "models": [], "error": str(exc)}

    def resolve_account_id(account_id: str | None) -> str:
        if account_id:
            account = profiles.get_account(account_id)
            if not account:
                raise HTTPException(404, "No se encontró la cuenta de modelo.")
            return account_id
        accounts = profiles.list_accounts()
        if len(accounts) == 1:
            return accounts[0]["id"]
        if not accounts:
            raise HTTPException(409, "onboarding_required: primero crea y confirma una cuenta.")
        raise HTTPException(409, "account_required: hay varias cuentas locales; indica el identificador.")

    def require_confirmed_account(account_id: str) -> dict:
        account = profiles.get_account(account_id)
        if not account or not account["confirmed"] or not account["artist_name"]:
            raise HTTPException(409, "account_unconfirmed: confirma el nombre artístico antes de continuar.")
        return account

    def require_ready_account(account_id: str) -> dict:
        account = require_confirmed_account(account_id)
        if not profiles.account_ready(account_id):
            raise HTTPException(409, "onboarding_required: completa un perfil de respuesta para esta cuenta.")
        return account

    @app.post("/api/suggestions", response_model=SuggestResponse)
    async def suggest(request: SuggestRequest):
        account_id = resolve_account_id(request.model_account_id)
        account = require_ready_account(account_id)
        if request.configured_mode == "off" or (request.generation_trigger == "automatic" and request.configured_mode != "auto"):
            raise HTTPException(422, "El modo configurado no permite esta generación.")
        # Manual pasted text is not a DOM row; the extension marks it false.
        if request.generation_trigger == "automatic" and not request.target_is_incoming:
            raise HTTPException(422, "Selecciona un mensaje entrante para responder.")
        if len(request.message) > config.max_message_chars or len(request.additional_context) > 4000:
            raise HTTPException(422, "El mensaje o contexto supera el límite configurado.")
        alias = " ".join((request.interlocutor or "").split()) or None
        profile = profiles.active(account_id)
        if profile is None:
            raise HTTPException(409, "onboarding_required: la cuenta no tiene un perfil activo y completo.")
        subject = (account_id, normalize_alias(alias)[0] if alias else request.conversation_id)
        draft_key = (subject, profile["id"])
        if not subject[1]:
            draft_key = None
        previous_responses = recent_drafts.get(draft_key)
        notes = store.relevant_notes(account_id, alias, request.message) if hasattr(store, "relevant_notes") else store.list_notes(account_id, alias)
        knowledge, source_status = read_knowledge_with_sources(config.knowledge_path)
        incoming_context = "\n".join(part for part in (request.context, request.additional_context) if part.strip())
        language_decision = detect_language(request.message, incoming_context, config.default_language)
        language = language_decision.name
        input_context_chars = len(request.context) + len(request.additional_context)
        context = request.context
        additional_context = request.additional_context
        knowledge_budget = 8000
        conversation_analysis = None
        analysis_budget_shape = {
            "current_topic": "x" * 80, "message_meaning": "x" * 100, "likely_intent": "x" * 80,
            "intent_confidence": 0.5, "references": ["x" * 60, "x" * 60], "observed_tone": "x" * 60,
            "active_topics": ["x" * 60, "x" * 60], "relevant_memory": ["x" * 60],
            "explicit_facts": ["x" * 60, "x" * 60], "inferences": ["x" * 60], "unknowns": ["x" * 60, "x" * 60],
            "money_or_tip_relevant": False, "adult_or_domination_supported": False,
        }
        truncation_reasons = []
        if request.client_context_truncated_by_window or request.dom_extracted_message_count > request.client_context_window:
            truncation_reasons.append("ventana seleccionada en la extensión")
        if request.client_context_truncated_by_characters:
            truncation_reasons.append("límite de caracteres de la extensión")
        if request.dom_extracted_unclassified_count:
            truncation_reasons.append("filas con dirección no clasificada")
        if len(context) + len(additional_context) > config.max_context_chars:
            if "límite MAX_CONTEXT_CHARS del backend" not in truncation_reasons:
                truncation_reasons.append("límite MAX_CONTEXT_CHARS del backend")
            while len(context) + len(additional_context) > config.max_context_chars and context:
                context = _drop_oldest_context_line(context)
            while len(context) + len(additional_context) > config.max_context_chars and additional_context:
                additional_context = _drop_oldest_context_line(additional_context)
        available_prompt_tokens = config.lm_studio_context_tokens - config.lm_studio_output_tokens - 128
        if available_prompt_tokens < 128:
            raise HTTPException(503, "El presupuesto de contexto configurado en el backend es menor que el espacio reservado para respuestas.")

        def build_messages():
            return build_suggestion_messages(
                message=request.message,
                context=context,
                additional_context=additional_context,
                interlocutor=alias,
                notes=notes,
                knowledge=knowledge,
                language=language,
                count=request.count,
                knowledge_budget=knowledge_budget,
                conversation_analysis=conversation_analysis or analysis_budget_shape,
                conversation_id=request.conversation_id,
                target_message_id=request.target_message_id,
                profile=profile,
                previous_responses=previous_responses,
            )

        messages = build_messages()
        estimated_prompt_tokens = _estimate_prompt_tokens(messages)
        # Preserve at least the newest visible chat row while optional sources are trimmed.
        while estimated_prompt_tokens > available_prompt_tokens and len(context.splitlines()) > 1:
            context = _drop_oldest_context_line(context)
            if "presupuesto estimado del modelo: historial DOM" not in truncation_reasons:
                truncation_reasons.append("presupuesto estimado del modelo: historial DOM")
            messages = build_messages()
            estimated_prompt_tokens = _estimate_prompt_tokens(messages)
        while estimated_prompt_tokens > available_prompt_tokens and additional_context:
            additional_context = _drop_oldest_context_line(additional_context)
            if "presupuesto estimado del modelo: contexto manual" not in truncation_reasons:
                truncation_reasons.append("presupuesto estimado del modelo: contexto manual")
            messages = build_messages()
            estimated_prompt_tokens = _estimate_prompt_tokens(messages)
        while estimated_prompt_tokens > available_prompt_tokens and knowledge_budget > 0:
            knowledge_budget = max(0, knowledge_budget - 1000)
            if "presupuesto estimado del modelo: fuentes personales" not in truncation_reasons:
                truncation_reasons.append("presupuesto estimado del modelo: fuentes personales")
            messages = build_messages()
            estimated_prompt_tokens = _estimate_prompt_tokens(messages)
        while estimated_prompt_tokens > available_prompt_tokens and context:
            context = _drop_oldest_context_line(context)
            if "presupuesto estimado del modelo: historial DOM" not in truncation_reasons:
                truncation_reasons.append("presupuesto estimado del modelo: historial DOM")
            messages = build_messages()
            estimated_prompt_tokens = _estimate_prompt_tokens(messages)
        if estimated_prompt_tokens > available_prompt_tokens:
            raise HTTPException(413, "El mensaje y las instrucciones base superan el presupuesto estimado del modelo. Reduce el mensaje o aumenta LM_STUDIO_CONTEXT_TOKENS según la configuración real del modelo.")
        # If budget trimming removed history used for a short/ambiguous target, recompute
        # the fallback language from exactly the context that will reach the model.
        included_context = "\n".join(part for part in (context, additional_context) if part.strip())
        final_language_decision = detect_language(request.message, included_context, config.default_language)
        if final_language_decision.code != language_decision.code:
            language_decision = final_language_decision
            language = language_decision.name
            messages = build_messages()
            estimated_prompt_tokens = _estimate_prompt_tokens(messages)
            while estimated_prompt_tokens > available_prompt_tokens and knowledge_budget > 0:
                knowledge_budget = max(0, knowledge_budget - 1000)
                if "presupuesto estimado del modelo: fuentes personales" not in truncation_reasons:
                    truncation_reasons.append("presupuesto estimado del modelo: fuentes personales")
                messages = build_messages()
                estimated_prompt_tokens = _estimate_prompt_tokens(messages)
            while estimated_prompt_tokens > available_prompt_tokens and context:
                context = _drop_oldest_context_line(context)
                if "presupuesto estimado del modelo: historial DOM" not in truncation_reasons:
                    truncation_reasons.append("presupuesto estimado del modelo: historial DOM")
                messages = build_messages()
                estimated_prompt_tokens = _estimate_prompt_tokens(messages)
            if estimated_prompt_tokens > available_prompt_tokens:
                raise HTTPException(413, "El prompt del idioma detectado excede el presupuesto del modelo. Aumenta LM_STUDIO_CONTEXT_TOKENS según la configuración real del modelo.")
        analysis_messages = build_context_analysis_messages(
            conversation_id=request.conversation_id,
            target_message_id=request.target_message_id,
            message=request.message,
            context="\n".join(part for part in (context, additional_context) if part.strip()),
            interlocutor=alias,
            notes=notes,
            language=language,
        )
        analysis = None
        analysis_rejection = ""
        for analysis_attempt in range(2):
            attempt_analysis_messages = analysis_messages
            if analysis_attempt:
                attempt_analysis_messages = [
                    *analysis_messages,
                    {"role": "user", "content": "El análisis anterior faltaba o no cumplía el esquema. Devuelve solo JSON válido y completo con todos los campos solicitados; no redactes sugerencias."},
                ]
            try:
                analyze = getattr(client, "analyze", None)
                analysis_answers = await analyze(attempt_analysis_messages) if analyze else await client.chat(attempt_analysis_messages, 1)
            except LMStudioError as exc:
                logger.warning("conversation_analysis_failed http_status=%s retry_used=%s error=%s", getattr(exc, "http_status", None), bool(analysis_attempt), str(exc))
                raise transport_failure(exc, "analysis", analysis_attempt + 1) from exc
            analysis = next((parse_context_analysis(answer) for answer in analysis_answers if answer), None) if analysis_answers else None
            analysis_rejection = _analysis_rejection(analysis)
            logger.info(
                "conversation_analysis_attempt attempt=%d http_status=200 extracted=%s rejection=%s retry_used=%s",
                analysis_attempt + 1, bool(analysis), analysis_rejection or "none", bool(analysis_attempt),
            )
            if not analysis_rejection:
                break
        if analysis_rejection:
            logger.warning("conversation_analysis_rejected reason=%s retry_used=true", analysis_rejection)
            detail = {
                "missing_context_analysis": "LM Studio no devolvió el análisis contextual estructurado tras un reintento.",
                "incomplete_context_analysis": "LM Studio devolvió un análisis contextual incompleto tras un reintento.",
                "invalid_context_confidence": "LM Studio devolvió una confianza de análisis inválida tras un reintento.",
                "invalid_context_analysis_format": "LM Studio devolvió el análisis contextual con formato inválido tras un reintento.",
            }.get(analysis_rejection, "LM Studio no pudo analizar el contexto de forma válida tras un reintento.")
            raise PipelineFailure(analysis_rejection, "analysis", 2, f"{detail} Puedes intentarlo de nuevo.")
        conversation_analysis = analysis
        messages = build_messages()
        estimated_prompt_tokens = _estimate_prompt_tokens(messages)
        while estimated_prompt_tokens > available_prompt_tokens and knowledge_budget > 0:
            knowledge_budget = max(0, knowledge_budget - 1000)
            if "presupuesto estimado del modelo: fuentes personales" not in truncation_reasons:
                truncation_reasons.append("presupuesto estimado del modelo: fuentes personales")
            messages = build_messages()
            estimated_prompt_tokens = _estimate_prompt_tokens(messages)
        if estimated_prompt_tokens > available_prompt_tokens:
            raise HTTPException(413, "El análisis contextual y las instrucciones superan el presupuesto estimado. Aumenta LM_STUDIO_CONTEXT_TOKENS o reduce el historial.")
        alternatives: list[str] = []
        response_language_codes: list[str] = []
        language_retry_used = False
        rejection_reason = ""
        rejection_history = []
        review_format_repairs = 0
        heuristic_overrides = []
        draft_repairs = []
        for attempt in range(2):
            attempt_messages = messages
            if attempt:
                language_retry_used = True
                retry_language_error = any(
                    code is not None and code != language_decision.code
                    for code, _ in (classify_language(text) for text in alternatives)
                )
                retry_reason = (
                    "la respuesta se detectó en un idioma distinto o mezcló idiomas"
                    if retry_language_error or rejection_reason == "wrong_language" else
                    "la respuesta repitió el mensaje entrante o un borrador previo; redacta con palabras nuevas"
                    if rejection_reason in {"repeated_response", "repeated_phrase", "repeated_idea", "copied_incoming", "repetitive_question"} else
                    "la revisión contextual detectó contenido fuera de tema o no respaldado: " + rejection_reason
                    if rejection_reason in {
                        "contextually_irrelevant", "unrequested_money", "unsupported_adult_or_domination",
                        "unsupported_claim", "multiple_responses", "missing_context_analysis", "incomplete_context_analysis",
                        "invalid_context_confidence", "invalid_context_analysis_format", "invalid_context_review_format",
                        "perspective_mismatch",
                    } else
                    "la respuesta anterior no contenía un borrador válido"
                )
                attempt_messages = [
                    *messages,
                    {
                        "role": "user",
                        "content": (
                            f"Reintento controlado: {retry_reason}. RESPONSE_LANGUAGE: {language}. "
                            'Usa el análisis contextual previo y el historial disponible. Regenera una sola respuesta exclusivamente en ese idioma. '
                            "Cumple el contrato JSON de responses y checks con una entrada. "
                            "Redacta desde la perspectiva del usuario y corrige cualquier inversión de emisor o pronombres. "
                            "Corrige en especial el motivo indicado; no añadas dinero, propinas, sexualidad, dominación o hechos sin respaldo. "
                            "Las notas del interlocutor no son preferencias del propietario: 'I' en el objetivo entrante es el interlocutor. "
                            "No añadas que compartes sus gustos. Una pregunta genérica sola no contesta una afirmación: atiende su contenido. "
                            "No incluyas alternativas ni traducción. No añadas explicaciones."
                            + "\nBorrador rechazado (solo contraejemplo, no hechos ni historial enviado): "
                            + json.dumps(alternatives[:1], ensure_ascii=False)
                            + "\nContesta únicamente este objetivo entrante, no el contraejemplo: "
                            + json.dumps(request.message, ensure_ascii=False)
                        ),
                    },
                ]
            try:
                # Generate one original draft; retry once only when it fails validation.
                answers = await client.chat(attempt_messages, 1)
            except LMStudioError as exc:
                logger.warning("suggestion_generation_failed http_status=%s retry_used=%s error=%s", getattr(exc, "http_status", None), bool(attempt), str(exc))
                raise transport_failure(exc, "generation", attempt + 1) from exc
            candidates = [
                part
                for answer in answers
                for part in (split_alternatives(answer) if answer else [])
            ]
            generation = parse_generation(answers[0]) if answers else parse_generation("")
            malformed_structured_output = any(
                answer.lstrip().startswith(("{", "```"))
                and not is_valid_response_json(answer)
                and len(split_alternatives(answer)) == 1
                for answer in answers
            )
            alternatives = distinct_answers(candidates, 1)
            format_name = generation.get("format", "empty")
            response_language_codes = [
                classify_language(text)[0] or "undetermined" for text in alternatives
            ]
            wrong_language = len(candidates) == 1 and any(
                code != language_decision.code
                for code, _ in (classify_language(text) for text in alternatives)
            )
            context_rejection = _context_review_rejection(generation) if len(alternatives) == 1 else ""
            draft_rejection = response_rejection(alternatives[0], request.message, language_decision.code, previous_responses, context=context + "\n" + additional_context, notes=notes) if alternatives else ""
            reviewer = getattr(client, "review_generation", None)
            if draft_rejection == "perspective_mismatch" and reviewer and context_rejection in {"", "perspective_mismatch"}:
                repaired = remove_reversed_vocative(alternatives[0])
                repairs = ["removed_reversed_vocative"]
                if response_rejection(repaired, request.message, language_decision.code, previous_responses,
                                      context=context + "\n" + additional_context, notes=notes) == "unsupported_claim":
                    narrowed = remove_unsupported_clauses(repaired, request.message, context=context + "\n" + additional_context, notes=notes)
                    if narrowed:
                        repaired = narrowed
                        repairs.append("removed_unsupported_clause")
                if repaired != alternatives[0] and len(repaired.split()) >= 3 and not response_rejection(
                    repaired, request.message, language_decision.code, previous_responses,
                    context=context + "\n" + additional_context, notes=notes,
                ):
                    # The wrong address is deleted, never replaced with an
                    # invented role. The separate audit below is mandatory.
                    alternatives = [repaired]
                    draft_rejection, context_rejection = "", ""
                    response_language_codes = [classify_language(repaired)[0] or "undetermined"]
                    draft_repairs.extend(repairs)
            if draft_rejection == "unsupported_claim" and reviewer and context_rejection in {"", "unsupported_claim"}:
                repaired = remove_unsupported_clauses(alternatives[0], request.message, context=context + "\n" + additional_context, notes=notes)
                if repaired:
                    repaired_reason = response_rejection(repaired, request.message, language_decision.code, previous_responses,
                                                         context=context + "\n" + additional_context, notes=notes)
                    if not repaired_reason:
                        alternatives = [repaired]
                        response_language_codes = [classify_language(repaired)[0] or "undetermined"]
                        wrong_language = False
                        draft_rejection, context_rejection = "", ""
                        draft_repairs.append("removed_unsupported_clause")
            owner_context = "\n".join(line for line in (context + "\n" + additional_context).splitlines()
                                      if line.lstrip().startswith("- Usuario"))
            verified_owner_notes = owner_notes(notes)
            requires_evidence = draft_rejection == "unsupported_claim" and bool(reviewer) and bool(owner_context.strip() or verified_owner_notes)
            if requires_evidence:
                # A lexical rule cannot recognize every paraphrase of a manual
                # fact. Only a separate, quote-checked review can resolve it.
                draft_rejection = ""
            rejection_reason = (
                "multiple_responses" if len(candidates) > 1 else
                draft_rejection if draft_rejection else
                "wrong_language" if wrong_language else
                context_rejection if context_rejection else
                "duplicate_or_near_duplicate" if len(candidates) > len(alternatives) else
                "empty_or_unrecognized_format" if not alternatives or malformed_structured_output else
                "only_one_valid_response" if len(alternatives) != 1 else ""
            )
            rejection_stage = "generation"
            if not rejection_reason and reviewer:
                rejection_stage = "grounding"
                audit_messages = review_messages(
                    draft=alternatives[0], incoming=request.message,
                    context=context + "\n" + additional_context, notes=notes, previous=previous_responses,
                    require_evidence=requires_evidence,
                )
                if _estimate_prompt_tokens(audit_messages) > available_prompt_tokens:
                    raise HTTPException(413, "La revisión de evidencia supera el presupuesto de contexto configurado.")
                try:
                    audit_evidence = {
                        "target": "" if requires_evidence else request.message,
                        "history": owner_context,
                        "notes": _bounded_notes(verified_owner_notes),
                    }
                    rejection_reason = review_rejection(await reviewer(audit_messages), evidence=audit_evidence, require_evidence=requires_evidence,
                                                       verified_courtesy=verified_wellbeing_exchange(alternatives[0], request.message),
                                                       other_evidence=viewer_evidence(request.message, context + "\n" + additional_context, notes),
                                                       preference_evidence=viewer_evidence(request.message, context + "\n" + additional_context, notes, preferences=True),
                                                       require_viewer_preference=viewer_preference_required(alternatives[0], request.message), draft=alternatives[0])
                    if rejection_reason == "invalid_grounding_review":
                        review_format_repairs += 1
                        # Repair the review's serialization before discarding a potentially valid draft.
                        repair_messages = [*audit_messages, {"role": "user", "content":
                            "Return the complete JSON schema including personal_claims (an array, empty when none). "
                            "Every claim source MUST be target, history or notes; draft and previous drafts are NOT evidence. "
                            "If a claim is unsupported, supported=false and evidence_quote is empty. No prose."}]
                        if _estimate_prompt_tokens(repair_messages) > available_prompt_tokens:
                            raise HTTPException(413, "La revisión de evidencia supera el presupuesto de contexto configurado.")
                        rejection_reason = review_rejection(await reviewer(repair_messages), evidence=audit_evidence, require_evidence=requires_evidence,
                                                       verified_courtesy=verified_wellbeing_exchange(alternatives[0], request.message),
                                                       other_evidence=viewer_evidence(request.message, context + "\n" + additional_context, notes),
                                                       preference_evidence=viewer_evidence(request.message, context + "\n" + additional_context, notes, preferences=True),
                                                       require_viewer_preference=viewer_preference_required(alternatives[0], request.message), draft=alternatives[0])
                except LMStudioError as exc:
                    raise transport_failure(exc, "grounding", attempt + 1) from exc
                if requires_evidence and not rejection_reason:
                    heuristic_overrides.append("unsupported_claim_with_verified_owner_evidence")
            if rejection_reason:
                rejection_history.append(rejection_reason)
            logger.info(
                "suggestion_generation_attempt attempt=%d http_status=200 format=%s extracted=%d accepted=%d rejection=%s retry_used=%s",
                attempt + 1, format_name, len(candidates), len(alternatives), rejection_reason or "none", bool(attempt),
            )
            if len(alternatives) == 1 and len(candidates) == 1 and not rejection_reason:
                break
        if len(alternatives) != 1 or rejection_reason:
            logger.warning("suggestion_generation_rejected reason=%s retry_used=%s accepted=%d", rejection_reason or "not_one_response", language_retry_used, len(alternatives))
            detail = {
                "duplicate_or_near_duplicate": "LM Studio devolvió una respuesta repetida tras un reintento.",
                "multiple_responses": "LM Studio devolvió más de una respuesta original tras un reintento.",
                "empty_or_unrecognized_format": "LM Studio devolvió una respuesta vacía o con JSON incompleto/no reconocido tras un reintento.",
                "only_one_valid_response": "LM Studio no devolvió una respuesta válida tras un reintento.",
                "wrong_language": f"LM Studio siguió respondiendo en un idioma distinto de {language_decision.name} tras un reintento.",
                "repeated_response": "LM Studio repitió el mensaje entrante o un borrador previo tras un reintento.",
                "copied_incoming": "La respuesta copió el mensaje entrante en lugar de contestarlo tras un reintento.",
                "repeated_phrase": "La respuesta repitió una expresión de un borrador anterior tras un reintento.",
                "repeated_idea": "La revisión detectó una idea repetida de un borrador anterior tras un reintento.",
                "repetitive_question": "La respuesta volvió a añadir una pregunta genérica tras un reintento.",
                "invalid_grounding_review": "No se pudo verificar la evidencia y perspectiva del borrador tras un reintento.",
                "invalid_draft": "LM Studio devolvió un borrador demasiado largo o con encabezados tras un reintento.",
                "contextually_irrelevant": "La revisión de LM Studio detectó respuestas fuera del tema actual tras un reintento.",
                "unrequested_money": "La revisión detectó propinas o dinero no solicitados tras un reintento.",
                "unsupported_adult_or_domination": "La revisión detectó contenido sexual o dominante no respaldado tras un reintento.",
                "unsupported_claim": "La revisión detectó afirmaciones sin respaldo en el contexto tras un reintento.",
                "perspective_mismatch": "La respuesta invirtió la perspectiva del usuario y el interlocutor incluso después de un reintento.",
                "missing_context_analysis": "LM Studio no devolvió el análisis contextual estructurado tras un reintento.",
                "incomplete_context_analysis": "LM Studio devolvió un análisis contextual incompleto tras un reintento.",
                "invalid_context_confidence": "LM Studio devolvió una confianza de análisis inválida tras un reintento.",
                "invalid_context_analysis_format": "LM Studio devolvió el análisis contextual con formato inválido tras un reintento.",
                "invalid_context_review_format": "LM Studio devolvió una revisión contextual inválida tras un reintento.",
                "review_language_mismatch": "La revisión contextual detectó un idioma incorrecto tras un reintento.",
            }.get(rejection_reason, "LM Studio no pudo producir una respuesta válida tras un reintento.")
            duplicate_source = response_duplicate_source(alternatives[0], request.message, previous_responses) if rejection_reason == "repeated_response" and alternatives else None
            raise PipelineFailure(rejection_reason or "empty_response", rejection_stage, 2, f"{detail} Puedes intentarlo de nuevo.", duplicate_source=duplicate_source)
        if any(code != language_decision.code for code, _ in (classify_language(text) for text in alternatives)):
            raise HTTPException(
                502,
                f"LM Studio siguió respondiendo en un idioma distinto de {language_decision.name} tras un reintento. No se mostraron esas respuestas; puedes intentarlo de nuevo.",
            )
        original_response = alternatives[0]
        recent_drafts.add(draft_key, original_response)
        spanish_translation = None
        notice = None
        translation_failure_reason = None
        translation_http_status = None
        translation_retry_token = None
        translation_attempts = 0
        translation_failure_stage = None
        if language_decision.code != "es":
            translation = await translate_and_review(
                client, original=original_response, language=language_decision.name, source_context=request.message,
            )
            spanish_translation = translation.text
            translation_failure_reason = translation.failure_reason
            translation_http_status = translation.http_status
            translation_attempts = translation.attempts
            translation_failure_stage = translation.failure_stage
            if translation.failure_reason:
                translation_retry_token = translation_retries.save(original_response, language_decision.code, translation.retry_state)
                notice = f"Respuesta original lista; traducción al español no disponible: {translation_failure_message(translation.failure_reason, translation.http_status)} Puedes reintentarla."
        full_prompt = "\n".join(message["content"] for message in messages)
        for name, source in source_status.items():
            source["included_in_prompt"] = f"<{name}>" in full_prompt
        context_input_message_count = _message_row_count(incoming_context)
        context_message_count = _message_row_count(context + "\n" + additional_context)
        return SuggestResponse(
            configured_mode=request.configured_mode,
            generation_trigger=request.generation_trigger,
            active_profile_id=profile["id"],
            model_account_id=account_id,
            conversation_id=request.conversation_id,
            target_message_id=request.target_message_id,
            generation_id=uuid.uuid4().hex,
            language=language_decision.code, original_response=original_response,
            spanish_translation=spanish_translation, interlocutor=alias, notice=notice,
            memory_available=bool(alias),
            diagnostics=SuggestionDiagnostics(
                generation_attempts=attempt + 1,
                rejection_history=rejection_history,
                review_format_repairs=review_format_repairs,
                heuristic_overrides=heuristic_overrides,
                draft_repairs=draft_repairs,
                translation_retry_token=translation_retry_token,
                translation_attempts=translation_attempts,
                translation_failure_stage=translation_failure_stage,
                knowledge_sources=source_status,
                memory_available=bool(alias),
                memory_note_count=len(notes),
                detected_language=language_decision.code,
                language_rule=language_decision.rule,
                language_confidence=language_decision.confidence,
                context_message_count=context_message_count,
                last_incoming_found=request.target_is_incoming and bool(request.message.strip()),
                context_sent=bool(incoming_context.strip()),
                response_count=len(alternatives),
                response_language_codes=response_language_codes,
                language_retry_used=language_retry_used,
                dom_extracted_message_count=request.dom_extracted_message_count,
                dom_extracted_incoming_count=request.dom_extracted_incoming_count,
                dom_extracted_outgoing_count=request.dom_extracted_outgoing_count,
                dom_extracted_unclassified_count=request.dom_extracted_unclassified_count,
                context_input_message_count=context_input_message_count,
                context_input_chars=input_context_chars,
                context_included_chars=len(context) + len(additional_context),
                client_context_window=request.client_context_window,
                context_truncation_reason=truncation_reasons,
                estimated_prompt_tokens=estimated_prompt_tokens,
                configured_model_context_tokens=config.lm_studio_context_tokens,
                configured_output_tokens=config.lm_studio_output_tokens,
                lm_studio_result="success",
                translation_status="not_needed" if language_decision.code == "es" else "available" if spanish_translation else "unavailable",
                translation_failure_reason=translation_failure_reason,
                translation_http_status=translation_http_status,
                translation_retry_available=language_decision.code != "es" and spanish_translation is None,
            ),
        )

    @app.get("/api/accounts")
    async def get_accounts():
        return {"accounts": profiles.list_accounts()}

    @app.post("/api/accounts", status_code=201)
    async def create_account(payload: AccountInput):
        try:
            return profiles.create_account(payload)
        except ValueError as exc:
            raise HTTPException(409, str(exc))

    @app.get("/api/accounts/{account_id}")
    async def get_account(account_id: str):
        account = profiles.get_account(account_id)
        if not account:
            raise HTTPException(404, "No se encontró la cuenta de modelo.")
        return account

    @app.put("/api/accounts/{account_id}")
    async def update_account(account_id: str, payload: AccountInput):
        try:
            account = profiles.update_account(account_id, payload)
        except ValueError as exc:
            raise HTTPException(409, str(exc))
        if not account:
            raise HTTPException(404, "No se encontró la cuenta de modelo.")
        return account

    @app.get("/api/accounts/{account_id}/profiles")
    async def get_account_profiles(account_id: str):
        try:
            return profiles.snapshot(account_id)
        except KeyError:
            raise HTTPException(404, "No se encontró la cuenta de modelo.")

    @app.post("/api/accounts/{account_id}/profiles", status_code=201)
    async def create_account_profile(account_id: str, payload: ProfileInput):
        try:
            return profiles.save_profile(account_id, payload)
        except KeyError as exc:
            raise HTTPException(404, "No se encontró la cuenta de modelo.") from exc

    @app.put("/api/accounts/{account_id}/profiles/{profile_id}")
    async def edit_account_profile(account_id: str, profile_id: str, payload: ProfileInput):
        try:
            return profiles.save_profile(account_id, payload, profile_id)
        except KeyError as exc:
            message = "No se encontró la cuenta de modelo." if str(exc).strip("'") == "account" else "Perfil no encontrado para esta cuenta."
            raise HTTPException(404, message) from exc

    @app.post("/api/accounts/{account_id}/profiles/{profile_id}/activate")
    async def activate_account_profile(account_id: str, profile_id: str):
        try:
            return profiles.select(account_id, profile_id)
        except KeyError as exc:
            raise HTTPException(404, "Perfil no encontrado para esta cuenta.") from exc

    @app.delete("/api/accounts/{account_id}/profiles/{profile_id}", status_code=204)
    async def delete_account_profile(account_id: str, profile_id: str):
        if not profiles.delete(account_id, profile_id):
            raise HTTPException(404, "Perfil no encontrado para esta cuenta.")
        return Response(status_code=204)

    # v1.1 compatibility: omitted account_id resolves only when exactly one local
    # account exists. No process-wide active-account or active-profile is used.
    @app.get("/api/profiles")
    async def get_profiles(account_id: str | None = None):
        if account_id is None and not profiles.list_accounts():
            return {"account": None, "active_id": None, "onboarding_complete": False, "profiles": []}
        return profiles.snapshot(resolve_account_id(account_id))

    @app.post("/api/profiles", status_code=201)
    async def create_profile(payload: ProfileInput, account_id: str | None = None):
        return profiles.save_profile(resolve_account_id(account_id), payload)

    @app.put("/api/profiles/{profile_id}")
    async def edit_profile(profile_id: str, payload: ProfileInput, account_id: str | None = None):
        try:
            return profiles.save_profile(resolve_account_id(account_id), payload, profile_id)
        except KeyError:
            raise HTTPException(404, "Perfil no encontrado para esa cuenta.")

    @app.post("/api/profiles/{profile_id}/activate")
    async def activate_profile(profile_id: str, account_id: str | None = None):
        try:
            return profiles.select(resolve_account_id(account_id), profile_id)
        except KeyError:
            raise HTTPException(404, "Perfil no encontrado para esa cuenta.")

    @app.delete("/api/profiles/{profile_id}", status_code=204)
    async def delete_profile(profile_id: str, account_id: str | None = None):
        if not profiles.delete(resolve_account_id(account_id), profile_id):
            raise HTTPException(404, "Perfil no encontrado para esa cuenta.")
        return Response(status_code=204)

    @app.post("/api/profiles/restore")
    async def restore_profiles():
        raise HTTPException(409, "El perfil personal predeterminado fue retirado; crea o edita un perfil de cuenta.")

    @app.get("/api/migrations")
    async def get_migration_status():
        return {"migrations": profiles.migration_status()}

    @app.post("/api/translation/retry", response_model=TranslationRetryResponse)
    async def retry_translation(request: TranslationRequest):
        if request.language.strip().casefold() in {"es", "español", "spanish"}:
            raise HTTPException(422, "La respuesta original ya está en español; no requiere traducción.")
        outcome = await translate_and_review(
            client, original=request.original_response, language=request.language, manual_retry=True,
            retry_state=translation_retries.take(request.retry_token, request.original_response, request.language),
        )
        if outcome.text:
            return TranslationRetryResponse(available=True, spanish_translation=outcome.text, attempts=outcome.attempts)
        return TranslationRetryResponse(
            available=False,
            failure_reason=outcome.failure_reason,
            failure_message=translation_failure_message(outcome.failure_reason, outcome.http_status),
            http_status=outcome.http_status,
            retry_token=translation_retries.save(request.original_response, request.language, outcome.retry_state),
            attempts=outcome.attempts,
            failure_stage=outcome.failure_stage,
        )

    def require_alias(alias: str | None):
        if not normalize_alias(alias):
            raise HTTPException(422, "Indica un alias para consultar o guardar memoria.")

    @app.get("/api/memory/{alias}")
    async def get_memory(alias: str, account_id: str | None = None):
        account_id = resolve_account_id(account_id)
        require_confirmed_account(account_id)
        return {"account_id": account_id, "interlocutor": alias, "notes": store.list_notes(account_id, alias)}

    @app.post("/api/memory/{alias}/notes")
    async def create_note(alias: str, payload: NoteInput, response: Response, account_id: str | None = None):
        account_id = resolve_account_id(account_id)
        require_confirmed_account(account_id)
        require_alias(alias)
        note = store.add_note(account_id, alias, payload.text)
        response.status_code = 201
        return note

    @app.put("/api/memory/{alias}/notes/{note_id}")
    async def update_note(alias: str, note_id: int, payload: NoteInput, account_id: str | None = None):
        account_id = resolve_account_id(account_id)
        require_confirmed_account(account_id)
        note = store.edit_note(account_id, alias, note_id, payload.text)
        if not note:
            raise HTTPException(404, "No se encontró esa nota para esta cuenta e interlocutor.")
        return note

    @app.delete("/api/memory/{alias}/notes/{note_id}", status_code=204)
    async def delete_note(alias: str, note_id: int, account_id: str | None = None):
        account_id = resolve_account_id(account_id)
        require_confirmed_account(account_id)
        if not store.delete_note(account_id, alias, note_id):
            raise HTTPException(404, "No se encontró esa nota para esta cuenta e interlocutor.")
        return Response(status_code=204)

    @app.delete("/api/memory/{alias}")
    async def clear_memory(alias: str, account_id: str | None = None):
        account_id = resolve_account_id(account_id)
        require_confirmed_account(account_id)
        require_alias(alias)
        recent_drafts.clear_subject((account_id, normalize_alias(alias)[0]))
        return {"deleted": store.clear(account_id, alias), "account_id": account_id}

    return app


app = create_app()
