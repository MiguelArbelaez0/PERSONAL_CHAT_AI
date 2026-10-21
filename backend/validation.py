"""Deterministic checks complement (but cannot replace) semantic model review."""
import re
from collections import OrderedDict, deque

from backend.answers import _is_duplicate
from backend.language import classify_language, has_language_conflict


def response_rejection(text, incoming, expected_language, previous=()):
    code, _ = classify_language(text)
    if code != expected_language or has_language_conflict(text, expected_language):
        return "wrong_language"
    if _is_duplicate(text, incoming) or any(_is_duplicate(text, item) for item in previous):
        return "repeated_response"
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
