"""Small deterministic language hinting for the incoming message and chat context."""
from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass


LANGUAGE_NAMES = {
    "en": "English",
    "es": "español",
    "fr": "français",
    "pt": "português",
    "de": "Deutsch",
    "it": "italiano",
    "ru": "русский",
    "uk": "українська",
    "ar": "العربية",
    "ja": "日本語",
    "zh": "中文",
    "ko": "한국어",
    "el": "Ελληνικά",
    "he": "עברית",
    "th": "ไทย",
    "hi": "हिन्दी",
}

_WORDS = {
    "en": {"the", "you", "your", "are", "what", "how", "want", "with", "this", "that", "have", "please", "thanks", "hello", "love", "can", "will", "would", "do", "does", "is", "was", "and", "for", "not", "but", "because", "when", "where", "glad", "hear", "great", "here", "like", "tell", "about", "tonight", "really", "happy", "sounds", "sure", "thank", "hey", "yeah", "yes", "yourself", "am", "to", "it", "we", "my", "me", "i", "no", "just", "so", "good", "nice"},
    "es": {"que", "como", "quiero", "gracias", "hola", "estas", "estoy", "eres", "tienes", "haces", "para", "pero", "porque", "con", "por", "una", "los", "las", "del", "dame", "puedes", "me", "te", "mi", "nos", "muy", "siempre", "encanta", "alegra", "genial", "claro", "ahora", "aqui", "estás", "qué", "cómo", "bien", "mucho", "si", "sí", "soy", "tú", "tu", "bonito", "bonita", "dime", "quieres", "tenerte", "verte", "cuéntame", "cuentame", "aquí", "también", "tambien", "tuve", "día", "dia", "largo", "trabajo", "hice", "hecho", "eh", "yo", "toda", "todo", "mejor", "saber", "más", "mas", "encantaría", "encantaria", "disfruté", "disfrute", "contigo", "mejor"},
    "fr": {"bonjour", "merci", "veux", "vous", "comment", "pourquoi", "avec", "mais", "est", "suis", "une", "des", "pour", "pas", "mon", "ma", "tu", "je", "quoi", "aime", "peux", "oui", "salut", "super", "plaisir", "heureux", "heureuse", "bien", "très", "ce", "c'est", "raconte", "ton", "energie", "énergie", "dis", "tete", "tête", "davantage", "lire", "ça", "fait", "moi", "en", "as", "oups", "désolée", "desolee", "désolé", "desole", "prends", "pris", "puis", "baisee", "baiser", "journée", "journee", "compliquée", "compliquee", "travail", "raconter", "passé", "passe"},
    "pt": {"ola", "obrigado", "obrigada", "voce", "voces", "quero", "como", "nao", "com", "uma", "para", "mas", "sou", "esta", "gosto", "por que", "tudo", "bem", "meu", "minha", "sim", "oi", "legal", "feliz", "muito", "você", "estou", "gostei", "claro", "fico", "estar", "aqui", "conta", "sua", "energia", "diz", "tem", "mente", "mais", "me", "seu", "está"},
    "de": {"hallo", "danke", "ich", "nicht", "und", "wie", "was", "bist", "sind", "willst", "mit", "dein", "deine", "eine", "das", "der", "die", "ist", "hast", "mochte", "ja", "gern", "toll", "freut", "schön", "du", "heute", "sehr"},
    "it": {"ciao", "grazie", "voglio", "come", "perche", "sono", "sei", "con", "non", "una", "che", "tu", "vorrei", "piace", "cosa", "questa", "questo", "molto", "mio", "mia", "si", "sì", "certo", "volentieri", "felice", "bello", "bella", "oggi", "davvero", "adoro", "tua", "dimmi", "hai", "la", "mente"},
}
_STRONG = {
    "en": {"hello", "thanks", "please", "want", "what", "where", "because", "glad", "hear", "great", "here", "yeah", "sure", "thank"},
    "es": {"hola", "quiero", "gracias", "estás", "estas", "haces", "dame", "puedes", "sí", "si", "alegra", "quieres", "también", "tambien", "trabajo", "hice", "cuéntame", "cuentame"},
    "fr": {"bonjour", "merci", "veux", "pourquoi", "français", "francais", "oui", "salut", "comment", "oups", "désolée", "desolee", "désolé", "desole", "baisee", "baiser"},
    "pt": {"olá", "ola", "obrigado", "obrigada", "você", "voce", "quero", "português", "portugues", "sim", "oi"},
    "de": {"hallo", "danke", "nicht", "ich", "du", "möchte", "mochte", "willst", "ja"},
    "it": {"ciao", "grazie", "voglio", "sono", "perché", "perche", "italiano", "sì", "si", "certo", "adoro"},
}
_TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)
_INCOMING_LINE = re.compile(r"(?im)^\s*-\s*Interlocutor(?:\s*\([^)]*\))?\s*:\s*(.+?)\s*$")


@dataclass(frozen=True)
class LanguageDecision:
    code: str
    name: str
    confidence: float
    rule: str


def _plain(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _script_language(text: str) -> str | None:
    counts = Counter(unicodedata.name(char, "") for char in text)
    scripts = {
        "ja": ("HIRAGANA", "KATAKANA"),
        "ko": ("HANGUL",),
        "ar": ("ARABIC",),
        "el": ("GREEK",),
        "he": ("HEBREW",),
        "th": ("THAI",),
        "hi": ("DEVANAGARI",),
    }
    for code, markers in scripts.items():
        if any(sum(count for name, count in counts.items() if marker in name) for marker in markers):
            return code
    cyrillic = sum(count for name, count in counts.items() if "CYRILLIC" in name)
    if cyrillic:
        return "uk" if re.search(r"[іїєґІЇЄҐ]", text) else "ru"
    if any("CJK UNIFIED IDEOGRAPH" in name for name in counts):
        return "zh"
    return None


def _score(text: str) -> tuple[str | None, float]:
    script = _script_language(text)
    if script:
        return script, 0.99
    normalized = _plain(text).replace("’", "'")
    # Expand frequent English contractions before token scoring; casual chat often relies on them.
    normalized = re.sub(r"\b(i)\s*'\s*m\b", "i am", normalized)
    normalized = re.sub(r"\b(it|that|he|she|you|we|they)\s*'\s*s\b", r"\1 is", normalized)
    normalized = re.sub(r"\b(im)\b", "i am", normalized)
    tokens = _TOKEN.findall(normalized)
    if not tokens:
        return None, 0.0
    scores: Counter[str] = Counter()
    strong_hits: set[str] = set()
    for token in tokens:
        for code, words in _WORDS.items():
            if token in {_plain(word) for word in words}:
                scores[code] += 1
        for code, words in _STRONG.items():
            if token in {_plain(word) for word in words}:
                scores[code] += 2
                strong_hits.add(code)
    if not scores:
        return None, 0.0
    ranked = scores.most_common()
    code, top = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    if top < 2 or top - runner_up < 1:
        return None, 0.0
    # Short greetings and emojis are ambiguous unless a distinctive word identifies them.
    if len(tokens) <= 2 and code not in strong_hits:
        return None, 0.0
    confidence = min(0.99, 0.55 + (top - runner_up) * 0.1 + (0.1 if code in strong_hits else 0))
    return code, confidence


def _context_language(context: str) -> tuple[str | None, float]:
    incoming = _INCOMING_LINE.findall(context or "")[-12:]
    if not incoming:
        return None, 0.0
    # Weight recent utterances more heavily so a language switch takes effect promptly.
    votes: Counter[str] = Counter()
    best_confidence: dict[str, float] = {}
    total = len(incoming)
    for index, message in enumerate(incoming):
        code, confidence = _score(message)
        if not code:
            continue
        weight = 0.5 ** (total - index - 1)
        votes[code] += weight
        best_confidence[code] = max(best_confidence.get(code, 0.0), confidence)
    ranked = votes.most_common()
    if ranked and (len(ranked) == 1 or ranked[0][1] >= ranked[1][1] * 1.15):
        code = ranked[0][0]
        return code, min(0.99, max(best_confidence.get(code, 0.6), 0.65))
    # Individual greetings and slang can be ambiguous. Combine only incoming rows
    # from this active chat; own/user messages never vote in language selection.
    return _score(" ".join(incoming[-6:]))


def classify_language(text: str) -> tuple[str | None, float]:
    """Return a confident language classification, or None when the text is ambiguous."""
    return _score(text)


def detect_language(message: str, context: str = "", default_language: str = "es") -> LanguageDecision:
    """Prefer the target message, then recent/predominant incoming context, then explicit config fallback."""
    code, confidence = _score(message)
    if code:
        rule = "last_incoming_message"
    else:
        code, confidence = _context_language(context)
        rule = "recent_incoming_context" if code else "configured_fallback"
    if not code:
        candidate = (default_language or "es").strip().lower().split("-", 1)[0]
        code = candidate if candidate in LANGUAGE_NAMES else "es"
        confidence = 0.0
    return LanguageDecision(code, LANGUAGE_NAMES.get(code, code), confidence, rule)
