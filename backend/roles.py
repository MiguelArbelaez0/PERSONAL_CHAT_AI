"""Source-derived addresses, never inferred relationships or persona facts."""
import re

from backend.answers import _normalize

ROLE_GREETING = re.compile(r"^(?:hey|hi|hello|bonjour|salut|bonsoir|hola|oi|ola)\s+(daddy|papa|papi|sir|master|boss)\b", re.IGNORECASE)
_TRAILING_ADDRESS = re.compile(r"[,!]\s*(daddy|papa|papi|sir|master|boss)\s*(?=[,.!?;—]|$)", re.IGNORECASE)


def incoming_address(incoming):
    match = ROLE_GREETING.search(_normalize(incoming)) or _TRAILING_ADDRESS.search(incoming)
    return match[1].casefold() if match else None


def address_frame(incoming):
    term = incoming_address(incoming)
    return {"target_author": "other_person", "reply_author": "account_owner",
            "target_first_person": "other_person", "target_second_person": "account_owner",
            "reply_first_person": "account_owner", "reply_second_person": "other_person",
            "incoming_vocative": term,
            "vocative_addresses": "account_owner" if term else None,
            "other_person_role": "not_established_by_this_address"}


def remove_reversed_vocative(text):
    # Delete only the explicit opening greeting/address; no new reply is made.
    result = re.sub(r"^\s*(?:hey|hi|hello|bonjour|salut|bonsoir|hola|oi|olá)\s+(?:daddy|papa|papi|sir|master|boss)\b[\s,!:.—-]*", "", text, count=1, flags=re.I).strip()
    return _TRAILING_ADDRESS.sub("", result).strip()
