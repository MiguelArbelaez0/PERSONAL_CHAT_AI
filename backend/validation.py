"""Deterministic checks complement (but cannot replace) semantic model review."""
import re
from collections import OrderedDict, deque
from difflib import SequenceMatcher

from backend.answers import _is_duplicate, _normalize
from backend.language import classify_language, has_language_conflict


_FUNCTION_WORDS = set("i you we me my your a an the to of for and but so it is am are was be have just je tu et de la le un une el en que te me por para eu voce com uma".split())
_COURTESY_WORDS = set("hi hey hello thanks thank doing well good oui vais bien merci bonsoir bonjour estoy gracias hola estou bem obrigado obrigada oi ola".split())
_COMPLETED_EVENT = re.compile(
    r"\b(?:(?:i|we)\s+(?:(?:ve|have|had|just|already|recently)\s+)*(?:had|chatted|talked|spoke|met|went|visited|ate|finished|promised)\b|"
    r"just\s+(?:had|finished|met|talked)\b|"
    r"(?:acabo|acabamos)\s+de\b|(?:tuve|tuvimos|prometi|fui)\b|"
    r"(?:je|nous)\s+(?:viens|venons|ai|avons)\b|(?:acabei|acabamos)\s+de\b|(?:tive|tivemos|prometi)\b)", re.IGNORECASE,
)
_ACTIVITY_OR_RECIPROCITY = re.compile(
    r"\b(?:(?:i am|i m|im|just|i have been|i ve been)\s+(?:just\s+)?"
    r"(?:lounging|relaxing|sitting|lying|watching|drinking|eating|working|thinking about|"
    r"(?:having|enjoying)\s+(?:a|the|my)\s+(?:(?:nice|good|quiet|lovely|great|sunny|relaxed|relaxing|busy)\s+)*(?:morning|afternoon|evening|night|day|coffee|drink|meal|chat|conversation|break))\b|"
    r"i\s+(?:missed|miss|was thinking about)\s+you\b|"
    r"(?:estoy|estou)\s+(?:viendo|comiendo|trabajando|assistindo|comendo|trabalhando)\b|"
    r"je\s+(?:regarde|travaille|mange)\b)", re.IGNORECASE,
)
_GENERIC_QUESTION = re.compile(r"(?:how about you|what about you|what are you up to|how was your day|et toi|e voce|y tu)\s*[?？]", re.IGNORECASE)
_ROLE_GREETING = re.compile(r"^(?:hey|hi|hello|bonjour|salut|bonsoir|hola|oi|ola)\s+(daddy|papa|papi|sir|master|boss)\b", re.IGNORECASE)


def _shared_content_phrase(left, right, minimum=4):
    a, b = _normalize(left).split(), _normalize(right).split()
    block = SequenceMatcher(None, a, b, autojunk=False).find_longest_match()
    return block.size >= minimum and len(set(a[block.a:block.a + block.size]) - _FUNCTION_WORDS - _COURTESY_WORDS) >= 2


def response_rejection(text, incoming, expected_language, previous=(), *, context="", notes=()):
    code, _ = classify_language(text)
    if code != expected_language or has_language_conflict(text, expected_language):
        return "wrong_language"
    if _is_duplicate(text, incoming) or any(_is_duplicate(text, item) for item in previous):
        return "repeated_response"
    if _shared_content_phrase(text, incoming, minimum=5) or any(
        len(_normalize(clause).split()) >= 4 and _normalize(clause) in _normalize(text)
        for clause in re.split(r"[.!?;\n]+", incoming) if clause.strip()
    ):
        return "copied_incoming"
    if any(_shared_content_phrase(text, item) for item in previous):
        return "repeated_phrase"
    if previous and _GENERIC_QUESTION.search(text) and _GENERIC_QUESTION.search(previous[-1]):
        return "repetitive_question"
    # Current feelings are not completed events. A past event needs visible
    # evidence; previous unsubmitted drafts are deliberately not evidence.
    evidence = "\n".join([incoming, context, *(str(note.get("text", "")) for note in notes)])
    if _COMPLETED_EVENT.search(_normalize(text)) and not _COMPLETED_EVENT.search(_normalize(evidence)):
        return "unsupported_claim"
    # Only owner-authored rows and manual notes can ground reciprocal feelings
    # or a concrete owner activity; the other person's feelings cannot do so.
    owner_evidence = "\n".join([
        *(line for line in context.splitlines() if re.match(r"\s*-\s*Usuario(?:\s*\([^)]*\))?\s*:", line)),
        *(str(note.get("text", "")) for note in notes),
    ])
    incoming_role = _ROLE_GREETING.search(_normalize(incoming))
    reply_role = _ROLE_GREETING.search(_normalize(text))
    if incoming_role and reply_role and incoming_role[1] == reply_role[1] and not _ROLE_GREETING.search(_normalize(owner_evidence)):
        return "perspective_mismatch"
    if _ACTIVITY_OR_RECIPROCITY.search(_normalize(text)) and not _ACTIVITY_OR_RECIPROCITY.search(_normalize(owner_evidence)):
        return "unsupported_claim"
    if len(text) > 1000 or re.search(r"(?im)^(?:respuesta|translation|traducción|assistant|asistente)\s*:", text):
        return "invalid_draft"
    return ""


class RecentDrafts:
    """Bounded, process-only history. Never persists model drafts as memories."""
    def __init__(self, max_chats=128):
        self.chats = OrderedDict()
        self.max_chats = max_chats

    def get(self, key):
        return tuple(self.chats.get(key, ())) if key else ()

    def add(self, key, text):
        if not key:
            return
        self.chats.setdefault(key, deque(maxlen=5)).append(text)
        self.chats.move_to_end(key)
        while len(self.chats) > self.max_chats:
            self.chats.popitem(last=False)

    def clear_subject(self, subject):
        for key in list(self.chats):
            if key[0] == subject:
                del self.chats[key]
