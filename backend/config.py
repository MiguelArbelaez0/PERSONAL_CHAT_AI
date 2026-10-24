from dataclasses import dataclass
import os
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent


def _load_local_env() -> None:
    """Read a small KEY=VALUE .env without overwriting process environment."""
    try:
        lines = (ROOT / ".env").read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip("\"'")
        if key.strip():
            os.environ.setdefault(key.strip(), value)


_load_local_env()


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    lm_studio_base_url: str = "http://127.0.0.1:1234/v1"
    lm_studio_model: str = ""
    lm_studio_timeout: float = 90.0
    lm_studio_context_tokens: int = 8192
    lm_studio_output_tokens: int = 1200
    default_language: str = "es"
    max_message_chars: int = 4000
    max_context_chars: int = 12000
    memory_max_notes: int = 100
    # v1.2 writes to a new store; the v1.1 paths remain read-only migration sources.
    database_path: Path = ROOT / "data" / "personal_chat_ai_v2.sqlite3"
    legacy_database_path: Path = ROOT / "data" / "personal_chat_ai.sqlite3"
    legacy_profiles_path: Path = ROOT / "data" / "personalities.sqlite3"
    knowledge_path: Path = ROOT / "knowledge"
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> "Settings":
        def integer(name: str, default: int, minimum: int = 1) -> int:
            value = int(os.getenv(name, str(default)))
            if value < minimum:
                raise ValueError(f"{name} debe ser >= {minimum}")
            return value

        timeout = float(os.getenv("LM_STUDIO_TIMEOUT", "90"))
        if timeout <= 0:
            raise ValueError("LM_STUDIO_TIMEOUT debe ser mayor que 0")
        context_tokens = integer("LM_STUDIO_CONTEXT_TOKENS", 8192)
        output_tokens = integer("LM_STUDIO_OUTPUT_TOKENS", 1200)
        if context_tokens <= output_tokens + 128:
            raise ValueError("LM_STUDIO_CONTEXT_TOKENS debe superar LM_STUDIO_OUTPUT_TOKENS en al menos 129 tokens")
        port = integer("BACKEND_PORT", 8000)
        if port > 65535:
            raise ValueError("BACKEND_PORT debe ser <= 65535")
        host = os.getenv("BACKEND_HOST", "127.0.0.1").strip()
        if host != "127.0.0.1":
            raise ValueError("BACKEND_HOST debe ser 127.0.0.1; el acceso remoto no está soportado")
        database_path = Path(os.getenv("PCAI_DATABASE_PATH", str(ROOT / "data" / "personal_chat_ai_v2.sqlite3")))
        if not database_path.is_absolute():
            database_path = ROOT / database_path
        legacy_database_path = Path(os.getenv("DATABASE_PATH", str(ROOT / "data" / "personal_chat_ai.sqlite3")))
        if not legacy_database_path.is_absolute():
            legacy_database_path = ROOT / legacy_database_path
        legacy_profiles_path = Path(os.getenv("PERSONALITIES_DATABASE_PATH", str(legacy_database_path.parent / "personalities.sqlite3")))
        if not legacy_profiles_path.is_absolute():
            legacy_profiles_path = ROOT / legacy_profiles_path
        knowledge_path = Path(os.getenv("KNOWLEDGE_PATH", str(ROOT / "knowledge")))
        if not knowledge_path.is_absolute():
            knowledge_path = ROOT / knowledge_path
        lm_url = os.getenv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1").rstrip("/")
        parsed_lm_url = urlsplit(lm_url)
        if parsed_lm_url.scheme != "http" or parsed_lm_url.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed_lm_url.username or parsed_lm_url.password:
            raise ValueError("LM_STUDIO_BASE_URL debe ser HTTP local (localhost, 127.0.0.1 o ::1), sin credenciales")
        return cls(
            host=host, port=port,
            lm_studio_base_url=lm_url,
            lm_studio_model=os.getenv("LM_STUDIO_MODEL", "").strip(),
            lm_studio_timeout=timeout,
            lm_studio_context_tokens=context_tokens,
            lm_studio_output_tokens=output_tokens,
            default_language=os.getenv("DEFAULT_LANGUAGE", "es"),
            max_message_chars=integer("MAX_MESSAGE_CHARS", 4000),
            max_context_chars=integer("MAX_CONTEXT_CHARS", 12000),
            memory_max_notes=integer("MEMORY_MAX_NOTES", 100),
            database_path=database_path,
            legacy_database_path=legacy_database_path,
            legacy_profiles_path=legacy_profiles_path,
            knowledge_path=knowledge_path,
            log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        )


settings = Settings.from_env()
