"""Spanish translation flow, including safe diagnostics without logging message text."""

import logging
import re
import hashlib
import secrets
import time
from collections import OrderedDict
from dataclasses import dataclass

from backend.answers import parse_translation, _json_object
from backend.language import classify_language, has_language_conflict, LANGUAGE_NAMES
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


def _repair_known_greetings(original, translation):
    """Repair known courtesy formulas, then run all language/semantic checks.

    'Tudo bem, obrigado...' answers a greeting. No arbitrary question is rewritten.
    """
    if re.match(r"\s*bonsoir\b", original, re.IGNORECASE):
        translation = re.sub(r"^(\s*¡?(?:muy\s+)?)buenas\s+tardes\b", r"\1Buenas noches", translation, count=1, flags=re.IGNORECASE)
    if re.search(r"(?:^|[.!])\s*tudo\s+bem\s*,\s*obrigad[oa]\b", original, re.IGNORECASE):
        translation = re.sub(r"¿\s*todo\s+bien\s*\?\s*", "Todo bien. ", translation, count=1, flags=re.IGNORECASE)
    # Correct an unambiguous opening/closing punctuation mismatch, without
    # adding a question or changing its words. Question guards still run below.
    return re.sub(r"¡([^¡¿!?]+)\?", r"¿\1?", translation)


@dataclass(frozen=True)
class TranslationOutcome:
    text: str | None
    failure_reason: str | None = None
    http_status: int | None = None
    attempts: int = 0
    failure_stage: str | None = None
    retry_state: dict | None = None


class TranslationRetries:
    """Short-lived repair state bound to the exact original; never persisted."""
    def __init__(self, limit=128, ttl=600):
        self.entries = OrderedDict()
        self.limit, self.ttl = limit, ttl

    @staticmethod
    def _key(original, language):
        normalized = language.strip().casefold()
        code = next((code for code, name in LANGUAGE_NAMES.items() if normalized in {code, name.casefold()}), normalized)
        return hashlib.sha256((code + "\0" + original).encode()).digest()

    def _expire(self):
        now = time.monotonic()
        for token, (created, _, _) in list(self.entries.items()):
            if now - created > self.ttl:
                del self.entries[token]

    def save(self, original, language, state):
        self._expire()
        token = secrets.token_urlsafe(24)
        self.entries[token] = (time.monotonic(), self._key(original, language), state)
        while len(self.entries) > self.limit:
            self.entries.popitem(last=False)
        return token

    def take(self, token, original, language):
        self._expire()
        entry = self.entries.get(token)
        if not entry or entry[1] != self._key(original, language):
            return None
        del self.entries[token]
        return entry[2]


def _assess_review(answers):
    if len(answers) != 1:
        return "invalid_review_format", []
    data = _json_object(answers[0])
    required = ("meaning_preserved", "no_added_or_omitted_information")
    if not data or any(type(data.get(key)) is not bool for key in required):
        return "invalid_review_format", []
    issues = data.get("issues", [])
    if not isinstance(issues, list):
        return "invalid_review_format", []
    safe_issues = []
    for issue in issues[:6]:
        if not isinstance(issue, dict) or issue.get("category") not in {"omission", "addition", "perspective", "negation", "speech_act", "meaning", "tone"}:
            return "invalid_review_format", []
        safe_issues.append({key: str(issue.get(key, ""))[:400] for key in ("category", "source_quote", "translation_quote")})
    if data.get("translation_is_spanish") is False:
        return "wrong_language", safe_issues
    if not all(data[key] for key in required) or safe_issues:
        return "fidelity_review_failed", safe_issues
    if data.get("translation_is_spanish") is not None and type(data.get("translation_is_spanish")) is not bool:
        return "invalid_review_format", []
    return "", []


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


async def translate_and_review(client, *, original: str, language: str, manual_retry=False, retry_state=None) -> TranslationOutcome:
    translate = getattr(client, "translate", None)
    if not translate:
        return TranslationOutcome(None, "translation_not_supported")
    review = getattr(client, "review_translation", None)
    if not review:
        return TranslationOutcome(None, "review_not_supported")

    state = retry_state or {}
    previous_failure = state.get("reason")
    rejected_translation = state.get("candidate")
    review_issues = state.get("issues", [])
    for attempt in range(2):
        retry = manual_retry or attempt == 1
        reason = None
        http_status = None
        stage = "generate"
        try:
            answers = await translate(build_translation_messages(
                original=original, language=language, retry=retry, failure_reason=previous_failure,
                rejected_translation=rejected_translation, review_issues=review_issues,
            ))
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
                if translation:
                    translation = _repair_known_greetings(original, translation)
                if translation:
                    rejected_translation = translation[:4000]
                    review_issues = []
                if not translation:
                    reason = "invalid_format"
                elif re.match(r"\s*bonsoir\b", original, re.IGNORECASE) and not re.search(r"\bbuenas\s+noches\b", translation, re.IGNORECASE):
                    reason = "greeting_mismatch"
                elif ((not _may_be_question(original) and any(mark in translation for mark in ("?", "？", "¿")))
                      or (original.count("?") + original.count("？") > 0
                          and translation.count("?") + translation.count("？") > original.count("?") + original.count("？"))):
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
                            reason, review_issues = _assess_review(review_answers)
                            if not reason:
                                review_data = _json_object(review_answers[0])
                                if translated_language is None and review_data.get("translation_is_spanish") is not True:
                                    reason = "language_unverified"
                                else:
                                    logger.info("translation_stage=complete result=success attempt=%d retry_used=%s", attempt + 1, retry)
                                    return TranslationOutcome(translation, attempts=attempt + 1)

        logger.warning(
            "translation_stage=%s result=failed attempt=%d retry_used=%s reason=%s http_status=%s",
            stage, attempt + 1, retry, reason, http_status,
        )
        # A second identical 4xx is unlikely to recover; other failures get one bounded retry.
        if attempt == 0 and not (reason == "http_error" and http_status is not None and 400 <= http_status < 500 and http_status != 429):
            previous_failure = reason
            logger.info("translation_retry scheduled=true next_attempt=2 reason=%s", reason)
            continue
        return TranslationOutcome(None, reason, http_status, attempts=attempt + 1, failure_stage=stage,
                                  retry_state={"candidate": rejected_translation, "reason": reason, "issues": review_issues})

    return TranslationOutcome(None, "translation_failed")


def translation_failure_message(reason: str | None, http_status: int | None = None) -> str:
    messages = {
        "translation_not_supported": "El cliente de LM Studio no permite traducir.",
        "empty_response": "LM Studio no devolvió contenido para la traducción.",
        "invalid_format": "La respuesta de LM Studio no contenía una traducción en el formato esperado.",
        "truncated": "LM Studio cortó la respuesta antes de terminar la traducción.",
        "wrong_language": "LM Studio devolvió una traducción que no está en español.",
        "added_question": "La traducción introdujo una pregunta ausente en el original.",
        "greeting_mismatch": "La traducción no conservó el saludo nocturno del original.",
        "invalid_response": "LM Studio devolvió un cuerpo de respuesta no válido.",
        "language_unverified": "No se pudo confirmar que la traducción esté en español.",
        "fidelity_review_failed": "La revisión detectó cambios u omisiones en la traducción.",
        "invalid_review_format": "LM Studio no devolvió una revisión de traducción verificable.",
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
