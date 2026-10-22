import json
import re
import unicodedata
from difflib import SequenceMatcher


_LEADING_MARKER = re.compile(r"^\s*(?:(?:respuesta|opción|opcion)\s*)?\d{1,2}[.)、: -]+", re.IGNORECASE)
_ALTERNATIVE_START = re.compile(r"^\s*(?:\d{1,2}[.)]|[-•])\s+(.+?)\s*$")
_NON_WORD = re.compile(r"[^\w]+", re.UNICODE)


def _normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text.casefold())
    plain = "".join(char for char in folded if not unicodedata.combining(char))
    return " ".join(_NON_WORD.sub(" ", plain).split())


def _is_duplicate(candidate: str, previous: str) -> bool:
    left, right = _normalize(candidate), _normalize(previous)
    if not left or not right:
        # Emoji/punctuation-only targets have no word tokens. They are not
        # duplicates of every textual reply; still reject an exact emoji echo.
        return candidate.strip() == previous.strip()
    if left == right:
        return True
    # Text similarity is only a duplicate signal at a very high threshold:
    # natural alternatives often share names, topic words, or a short opener.
    if SequenceMatcher(None, left, right).ratio() >= 0.90:
        return True
    left_words, right_words = set(left.split()), set(right.split())
    if min(len(left_words), len(right_words)) >= 5:
        overlap = len(left_words & right_words) / len(left_words | right_words)
        if overlap >= 0.80:
            return True
    return False


def distinct_answers(answers: list[str], limit: int = 2) -> list[str]:
    """Remove empty and repeated drafts without padding the result."""
    if limit <= 0:
        return []
    result: list[str] = []
    for answer in answers:
        cleaned = _LEADING_MARKER.sub("", str(answer)).strip()
        if not cleaned or any(_is_duplicate(cleaned, item) for item in result):
            continue
        result.append(cleaned)
        if len(result) >= limit:
            break
    return result


def _json_objects(text: str):
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            parsed, _ = decoder.raw_decode(text[index:])
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(parsed, dict):
            yield parsed


def _json_object(text: str) -> dict | None:
    return next(_json_objects(text), None)


def _response_json(text: str) -> dict | None:
    return next((item for item in _json_objects(text) if isinstance(item.get("responses"), list)), None)


def parse_context_analysis(answer: str) -> dict | None:
    """Extract the structured analysis, tolerating a short accidental preamble."""
    for parsed in _json_objects(str(answer or "").strip()):
        analysis = parsed.get("analysis")
        # The prompt asks for {"analysis": {...}}, but some LM Studio templates
        # return the exact requested analysis fields at the JSON root. Accept that
        # schema-equivalent shape while still rejecting unrelated JSON objects.
        if not isinstance(analysis, dict):
            required = {
                "current_topic", "message_meaning", "likely_intent", "intent_confidence", "references",
                "observed_tone", "active_topics", "relevant_memory", "explicit_facts", "inferences", "unknowns",
                "money_or_tip_relevant", "adult_or_domination_supported",
            }
            if not required.intersection(parsed):
                continue
            analysis = parsed
        normalized = dict(analysis)
        for key in ("current_topic", "message_meaning", "likely_intent", "observed_tone"):
            value = normalized.get(key)
            if isinstance(value, list):
                normalized[key] = "; ".join(str(item).strip() for item in value if str(item).strip())
        for key in ("references", "active_topics", "relevant_memory", "explicit_facts", "inferences", "unknowns"):
            value = normalized.get(key)
            if isinstance(value, str):
                normalized[key] = [value] if value.strip() else []
            elif value is None:
                normalized[key] = []
            elif isinstance(value, list):
                normalized[key] = [item if isinstance(item, str) else json.dumps(item, ensure_ascii=False) for item in value]
        confidence = normalized.get("intent_confidence")
        if isinstance(confidence, str):
            try:
                normalized["intent_confidence"] = float(confidence.strip().removesuffix("%")) / (100 if confidence.strip().endswith("%") else 1)
            except ValueError:
                pass
        for key in ("money_or_tip_relevant", "adult_or_domination_supported"):
            value = normalized.get(key)
            if isinstance(value, str) and value.strip().casefold() in {"true", "false"}:
                normalized[key] = value.strip().casefold() == "true"
        return normalized
    return None


def parse_generation(answer: str) -> dict:
    """Return parsed drafts and the optional structured context/relevance review."""
    text = str(answer or "").strip()
    parsed = _response_json(text)
    if parsed is not None:
        return {
            "responses": [item.strip() for item in parsed["responses"] if isinstance(item, str) and item.strip()],
            "analysis": parsed.get("analysis"),
            "checks": parsed.get("checks"),
            "format": "json",
        }
    return {"responses": split_alternatives(text), "analysis": None, "checks": None, "format": "numbered_or_unstructured"}


def parse_translation(answer: str) -> str | None:
    """Extract a translation object; the separate semantic review makes the final fidelity decision."""
    for parsed in _json_objects(str(answer or "").strip()):
        value = parsed.get("translation")
        faithful = parsed.get("faithful")
        no_content_drift = parsed.get("adds_or_omits_information")
        if isinstance(value, str) and value.strip() and faithful is not False and no_content_drift is not True:
            return value.strip()
    return None


def parse_translation_review(answer: str) -> bool:
    for parsed in _json_objects(str(answer or "").strip()):
        if parsed.get("meaning_preserved") is True and parsed.get("no_added_or_omitted_information") is True:
            return True
    return False


def parse_translation_review_language(answer: str) -> bool | None:
    for parsed in _json_objects(str(answer or "").strip()):
        value = parsed.get("translation_is_spanish")
        if isinstance(value, bool):
            return value
    return None


def is_valid_response_json(answer: str) -> bool:
    return _response_json(str(answer or "").strip()) is not None


def split_alternatives(answer: str) -> list[str]:
    """Parse the supported response JSON contract, then a recognizable numbered list.

    Prose without a recognized structure remains a single candidate; it is never
    fabricated into additional response alternatives.
    """
    text = str(answer or "").strip()
    if not text:
        return []
    parsed = _response_json(text)
    if parsed is not None:
        return [item.strip() for item in parsed["responses"] if isinstance(item, str) and item.strip()]

    parts: list[str] = []
    current: list[str] = []
    found_markers = False
    for line in text.splitlines():
        match = _ALTERNATIVE_START.match(line)
        if match:
            found_markers = True
            if current:
                parts.append(" ".join(current).strip())
            current = [match.group(1)]
        elif current and line.strip():
            current.append(line.strip())
    if current:
        parts.append(" ".join(current).strip())
    return parts if found_markers else [text]
