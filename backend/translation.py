"""Spanish translation flow, including safe diagnostics without logging message text."""

import logging
import re
from dataclasses import dataclass

from backend.answers import parse_translation, parse_translation_review, parse_translation_review_language
from backend.language import classify_language, has_language_conflict
from backend.lm_studio import LMStudioError
from backend.prompt import build_translation_messages, build_translation_review_messages

logger = logging.getLogger(__name__)


def _may_be_question(text: str) -> bool:
    # Chat often omits punctuation. Avoid rejecting faithful translations of
    # unpunctuated questions; ambiguous cases still undergo semantic review.
    return any(mark in text for mark in ("?", "？")) or bool(re.search(
        r"\b(?:how|what|why|where|when|who|which|comment|pourquoi|quand|qui|quoi|"
        r"como|cómo|qué|que|cuándo|cuál|dónde|quién|onde|quando|qual|quem)\b|"
        r"(?:^|[.,!;])\s*(?:are you|do you|did you|can you|could you|would you|"
        r"est-ce|tu vas|vas-tu|você está|voce esta)\b", text, re.IGNORECASE,
    ))


@dataclass(frozen=True)
class TranslationOutcome:
    text: str | None
    failure_reason: str | None = None
    http_status: int | None = None


def _failure_code(error: LMStudioError) -> str:
    if error.reason_code:
        return error.reason_code
    if error.http_status:
        return "http_error"
    if "tardó demasiado" in str(error).casefold():
        return "timeout"
    if "conectar" in str(error).casefold() or "no responde" in str(error).casefold():
        return "unavailable"
    if "respuesta no válida" in str(error).casefold():
        return "invalid_response"
    return "lm_studio_error"


async def translate_and_review(client, *, original: str, language: str) -> TranslationOutcome:
    translate = getattr(client, "translate", None)
    if not translate:
        return TranslationOutcome(None, "translation_not_supported")
    review = getattr(client, "review_translation", None)
    if not review:
        return TranslationOutcome(None, "review_not_supported")

    previous_failure = None
    for attempt in range(2):
        retry = attempt == 1
        reason = None
        http_status = None
        stage = "generate"
        try:
            answers = await translate(build_translation_messages(original=original, language=language, retry=retry, failure_reason=previous_failure))
        except LMStudioError as exc:
            reason, http_status = _failure_code(exc), exc.http_status
        except Exception as exc:
            logger.error("translation_stage=generate result=failed attempt=%d error_type=%s", attempt + 1, type(exc).__name__)
            reason = "client_exception"
        else:
            if not answers:
                reason = "empty_response"
            else:
                translation = next((parse_translation(answer) for answer in answers if answer), None)
                if not translation:
                    reason = "invalid_format"
                elif not _may_be_question(original) and any(mark in translation for mark in ("?", "？", "¿")):
                    # A semantic self-review can miss this visible change of act.
                    reason = "added_question"
                else:
                    translated_language, _ = classify_language(translation)
                    if (translated_language and translated_language != "es") or has_language_conflict(translation, "es"):
                        reason = "wrong_language"
                    else:
                        stage = "review"
                        try:
                            review_answers = await review(build_translation_review_messages(
                                original=original, translation=translation, language=language,
                            ))
                        except LMStudioError as exc:
                            reason, http_status = f"review_{_failure_code(exc)}", exc.http_status
                        except Exception as exc:
                            logger.error("translation_stage=review result=failed attempt=%d error_type=%s", attempt + 1, type(exc).__name__)
                            reason = "review_client_exception"
                        else:
                            if not any(parse_translation_review(answer) for answer in review_answers if answer):
                                reason = "fidelity_review_failed"
                            else:
                                language_reviews = [parse_translation_review_language(answer) for answer in review_answers if answer]
                                if any(result is False for result in language_reviews):
                                    reason = "wrong_language"
                                elif translated_language is None and not any(result is True for result in language_reviews):
                                    reason = "language_unverified"
                                else:
                                    logger.info("translation_stage=complete result=success attempt=%d retry_used=%s", attempt + 1, retry)
                                    return TranslationOutcome(translation)

        logger.warning(
            "translation_stage=%s result=failed attempt=%d retry_used=%s reason=%s http_status=%s",
            stage, attempt + 1, retry, reason, http_status,
        )
        # A second identical 4xx is unlikely to recover; other failures get one bounded retry.
        if attempt == 0 and not (reason == "http_error" and http_status is not None and 400 <= http_status < 500 and http_status != 429):
            previous_failure = reason
            logger.info("translation_retry scheduled=true next_attempt=2 reason=%s", reason)
            continue
        return TranslationOutcome(None, reason, http_status)

    return TranslationOutcome(None, "translation_failed")


def translation_failure_message(reason: str | None, http_status: int | None = None) -> str:
    messages = {
        "translation_not_supported": "El cliente de LM Studio no permite traducir.",
        "empty_response": "LM Studio no devolvió contenido para la traducción.",
        "invalid_format": "La respuesta de LM Studio no contenía una traducción en el formato esperado.",
        "truncated": "LM Studio cortó la respuesta antes de terminar la traducción.",
        "wrong_language": "LM Studio devolvió una traducción que no está en español.",
        "added_question": "La traducción introdujo una pregunta ausente en el original.",
        "invalid_response": "LM Studio devolvió un cuerpo de respuesta no válido.",
        "language_unverified": "No se pudo confirmar que la traducción esté en español.",
        "fidelity_review_failed": "La revisión detectó cambios u omisiones en la traducción.",
        "review_not_supported": "El cliente de LM Studio no permite revisar la fidelidad.",
        "timeout": "LM Studio agotó el tiempo de espera durante la traducción.",
        "unavailable": "LM Studio no está disponible durante la traducción.",
        "lm_studio_error": "LM Studio devolvió un error durante la traducción.",
        "client_exception": "Ocurrió un error del cliente durante la traducción.",
        "review_timeout": "LM Studio agotó el tiempo de espera al revisar la traducción.",
        "review_truncated": "LM Studio cortó la respuesta antes de terminar la revisión.",
        "review_unavailable": "LM Studio no está disponible al revisar la traducción.",
        "review_http_error": "LM Studio devolvió un error HTTP al revisar la traducción.",
        "review_lm_studio_error": "LM Studio devolvió un error al revisar la traducción.",
        "review_invalid_response": "LM Studio devolvió un cuerpo no válido al revisar la traducción.",
        "review_client_exception": "Ocurrió un error al revisar la fidelidad de la traducción.",
    }
    detail = messages.get(reason or "", "No se pudo validar la traducción.")
    return f"{detail} (HTTP {http_status})." if http_status else detail
