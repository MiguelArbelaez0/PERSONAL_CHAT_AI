import re
from pathlib import Path

DEFAULTS = {
    "perfil.md": "No se ha configurado un perfil. No inventes datos personales.",
    "personalidad.md": "Responde con calidez, naturalidad y brevedad. Mantén un tono respetuoso.",
    "estilo_de_comunicacion.md": "Usa un estilo claro, natural y breve.",
    "ejemplos_de_respuestas.md": "Aún no hay ejemplos personalizados.",
    "instrucciones_operativas.md": "Responde al mensaje actual como borrador y no afirmes que se envió.",
    "contexto_y_fuentes.md": "No hay contexto personal adicional verificado.",
}

CORE_FILES = (
    "personalidad.md",
    "estilo_de_comunicacion.md",
    "instrucciones_operativas.md",
)
OPTIONAL_FILES = (
    "perfil.md",
    "ejemplos_de_respuestas.md",
    "contexto_y_fuentes.md",
)
MAX_FILE_CHARS = 20_000
MAX_KNOWLEDGE_CHARS = 8_000
_WORD = re.compile(r"[\wáéíóúüñ]{3,}", re.IGNORECASE)
_FINANCIAL_TOPIC = re.compile(r"\b(?:tip(?:s|ping|per|pear)?|token(?:s)?|tk|propina(?:s)?|tippear|dinero|money|pourboire(?:s)?|cash|payment|pago(?:s)?|compra(?:s)?|reward(?:s)?|room\s+goal|meta\s+de\s+sala|objetivo\s+de\s+sala)\b", re.IGNORECASE)
_DOMINATION_TOPIC = re.compile(r"\b(?:dom(?:inaci[oó]n|inar|inante|inant|inance|ination)?|control|obedecer|obey|domin[eé]|domin[aá]r)\b", re.IGNORECASE)


def _file_exists(path: Path) -> bool:
    try:
        return path.is_file()
    except OSError:
        return False


def read_knowledge_with_sources(directory: Path) -> tuple[dict[str, str], dict[str, dict[str, object]]]:
    """Read knowledge while returning source metadata without exposing file contents."""
    knowledge: dict[str, str] = {}
    sources: dict[str, dict[str, object]] = {}
    for name, fallback in DEFAULTS.items():
        local_path = directory / "local" / name
        shared_path = directory / name
        local_exists = _file_exists(local_path)
        shared_exists = _file_exists(shared_path)
        content = ""
        source = "default"
        for path, candidate in ((local_path, "local_override"), (shared_path, "shared_file")):
            try:
                with path.open("r", encoding="utf-8") as stream:
                    content = stream.read(MAX_FILE_CHARS + 1).strip()[:MAX_FILE_CHARS]
                if content:
                    source = candidate
                    break
            except (OSError, UnicodeError):
                continue
        knowledge[name] = content or fallback
        sources[name] = {
            "local_file_exists": local_exists,
            "shared_file_exists": shared_exists,
            "loaded_from": source,
            "loaded": bool(content),
            "included_in_prompt": False,
        }
    return knowledge, sources


def read_knowledge(directory: Path) -> dict[str, str]:
    """Read the six editable knowledge files; local/ overrides are never required."""
    knowledge, _ = read_knowledge_with_sources(directory)
    return knowledge


def _sections(content: str) -> list[str]:
    parts = re.split(r"(?m)(?=^#{1,3}\s+)", content.strip())
    return [part.strip() for part in parts if part.strip()]


def _relevance(section: str, message_words: set[str]) -> int:
    words = set(_WORD.findall(section.casefold()))
    return len(words & message_words)


def _choose_sections(content: str, message_words: set[str], limit: int, *, always_first: bool = False) -> str:
    sections = _sections(content)
    if not sections:
        return ""
    scored = sorted(enumerate(sections), key=lambda pair: (-_relevance(pair[1], message_words), pair[0]))
    selected: list[tuple[int, str]] = []
    used = 0
    if always_first:
        first_index = next((index for index, section in enumerate(sections) if len(re.sub(r"(?m)^#{1,3}\s+.*$", "", section).strip()) >= 40), 0)
        first = sections[first_index][:limit]
        selected.append((first_index, first))
        used = len(first)
    for index, section in scored:
        if any(index == chosen_index for chosen_index, _ in selected):
            continue
        remaining = limit - used
        if remaining <= 0:
            break
        # Skip unrelated sections in personal profile/source notes. Examples may still
        # provide a useful style reference, so their caller can request a fallback.
        score = _relevance(section, message_words)
        if not score and message_words:
            continue
        excerpt = section[:remaining]
        selected.append((index, excerpt))
        used += len(excerpt)
    return "\n\n".join(section for _, section in sorted(selected))


def _select_writing_examples(content: str, message_words: set[str], limit: int) -> str:
    """Select actual message/reply pairs, excluding unrelated prompt-trigger examples."""
    sections = _sections(content)
    candidates = [
        (index, section) for index, section in enumerate(sections)
        if re.search(r"(?im)^\s*\*{0,2}(?:viewer|mensaje recibido|incoming message)\*{0,2}\s*:\*{0,2}", section)
        and re.search(r"(?im)^\s*\*{0,2}(?:respuesta deseada|respuesta que prefiero|respuesta|preferred response|reply)\*{0,2}\s*:\*{0,2}", section)
    ]
    if not candidates:
        return ""
    ranked = sorted(candidates, key=lambda pair: (-_relevance(pair[1], message_words), pair[0]))
    selected: list[tuple[int, str]] = []
    used = 0
    for index, section in ranked:
        if used >= limit:
            break
        remaining = limit - used
        excerpt = section[:remaining]
        if excerpt:
            selected.append((index, excerpt))
            used += len(excerpt)
    return "\n\n".join(section for _, section in sorted(selected))


def _safe_core_instructions(name: str, content: str) -> str:
    """Drop setup-only chatbot triggers and profile claims that outrank system rules."""
    lines = content.splitlines()
    result: list[str] = []
    skip_section = False
    skip_numbered_item = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#"):
            skip_section = name == "personalidad.md" and "respuesta inicial obligatoria" in stripped.casefold()
            skip_numbered_item = False
        if skip_section:
            continue
        if name == "instrucciones_operativas.md" and re.match(r"^\d+\.\s+", stripped):
            number = int(stripped.split(".", 1)[0])
            if number not in {1, 2} or not any(
                marker in stripped.casefold() for marker in ("prompt maestro", "a partir de ese momento")
            ):
                skip_numbered_item = False
            else:
                skip_numbered_item = True
                continue
        if skip_numbered_item:
            continue
        lowered = stripped.casefold()
        if name in {"personalidad.md", "instrucciones_operativas.md"} and _DOMINATION_TOPIC.search(stripped):
            continue
        if (
            (name == "instrucciones_operativas.md" and " > " in stripped and ("cualquier otra instrucción" in lowered or "coherencia de personaje" in lowered))
            or stripped.casefold().startswith("estoy listo para responder los mensajes")
        ):
            continue
        result.append(line)
    return "\n".join(result).strip()


def _remove_topic_lines(content: str, pattern: re.Pattern[str]) -> str:
    """Keep safe facts/styles while withholding unrelated recurring topic details."""
    return "\n".join(line for line in content.splitlines() if not pattern.search(line)).strip()


def _remove_topic_examples(content: str, pattern: re.Pattern[str]) -> str:
    """Drop whole examples that would repeatedly steer output toward an inactive topic."""
    return "\n\n".join(section for section in _sections(content) if not pattern.search(section))


def select_knowledge(
    knowledge: dict[str, str], message: str, *, budget: int = MAX_KNOWLEDGE_CHARS,
    current_message: str | None = None,
) -> dict[str, str]:
    """Keep core style guidance and select topical personal facts/examples within a budget."""
    words = set(_WORD.findall(message.casefold()))
    active_target = current_message if current_message is not None else message
    include_financial = bool(_FINANCIAL_TOPIC.search(active_target))
    # The incoming message and literal history remain available to the model;
    # persona files must never make dominance an always-on default.
    include_domination = False
    selected: dict[str, str] = {}
    remaining = max(0, budget)
    per_file = {
        "personalidad.md": 1800,
        "estilo_de_comunicacion.md": 1400,
        "instrucciones_operativas.md": 1800,
        "perfil.md": 2000,
        "ejemplos_de_respuestas.md": 1600,
        "contexto_y_fuentes.md": 1400,
    }
    for name in (*CORE_FILES, *OPTIONAL_FILES):
        limit = min(per_file[name], remaining)
        if limit <= 0:
            break
        content = knowledge.get(name, DEFAULTS[name])
        if not include_financial:
            content = _remove_topic_examples(content, _FINANCIAL_TOPIC) if name == "ejemplos_de_respuestas.md" else _remove_topic_lines(content, _FINANCIAL_TOPIC)
        if not include_domination:
            content = _remove_topic_examples(content, _DOMINATION_TOPIC) if name == "ejemplos_de_respuestas.md" else _remove_topic_lines(content, _DOMINATION_TOPIC)
        if name in CORE_FILES:
            excerpt = _safe_core_instructions(name, content)[:limit]
        else:
            if name == "perfil.md":
                excerpt = _choose_sections(content, words, limit, always_first=True)
            elif name == "ejemplos_de_respuestas.md":
                excerpt = _select_writing_examples(content, words, limit)
            else:
                excerpt = _choose_sections(content, words, limit)
        if excerpt:
            selected[name] = excerpt
            remaining -= len(excerpt)
    return selected
