"""Account-scoped identities and response profiles stored locally."""
from __future__ import annotations

import json
import hashlib
import re
import sqlite3
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class AccountInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    platform: str = Field(default="stripchat", min_length=1, max_length=40, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    artist_name: str | None = Field(default=None, max_length=80)
    platform_user_id: str | None = Field(default=None, max_length=160)
    identity_source: Literal["dom", "manual", "legacy_import"] = "manual"
    confirmed: bool = False

    @field_validator("artist_name", "platform_user_id")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        value = " ".join(value.split()) if value is not None else None
        return value or None

    @model_validator(mode="after")
    def confirmed_identity_has_name(self):
        if self.confirmed and not self.artist_name:
            raise ValueError("Una cuenta confirmada requiere un nombre artístico.")
        return self


class ResponseStyle(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    tone: list[str] = Field(default_factory=list, max_length=12)
    length: Literal["short", "medium", "long"] | None = None
    emoji_policy: Literal["match_context", "few", "none"] | None = None
    custom_instructions: str = Field(default="", max_length=600)

    @field_validator("tone")
    @classmethod
    def clean_tone(cls, values: list[str]) -> list[str]:
        return _clean_items(values, 12, 80)


PROFILE_SECTIONS = frozenset({
    "personality", "interests", "visitor_types", "conversation_dynamics",
    "response_style", "languages", "personal_boundaries",
})
DATABASE_SCHEMA_VERSION = 2


def _clean_items(values: list[str], maximum: int, item_chars: int) -> list[str]:
    if len(values) > maximum:
        raise ValueError(f"No se permiten más de {maximum} elementos.")
    cleaned = []
    for value in values:
        value = " ".join(value.split())
        if not value:
            continue
        if len(value) > item_chars:
            raise ValueError(f"Cada elemento debe tener como máximo {item_chars} caracteres.")
        cleaned.append(value)
    return cleaned


class ProfileInput(BaseModel):
    """A profile has no personal defaults; empty values mean no preference was supplied."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    schema_version: Literal[2] = 2
    name: str | None = Field(default=None, max_length=80)
    description: str = Field(default="", max_length=800)
    tone: str = Field(default="", max_length=300)
    style: str = Field(default="", max_length=300)
    rules: str = Field(default="", max_length=1000)
    personality: list[str] = Field(default_factory=list, max_length=20)
    interests: list[str] = Field(default_factory=list, max_length=30)
    visitor_types: list[str] = Field(default_factory=list, max_length=20)
    conversation_dynamics: list[str] = Field(default_factory=list, max_length=30)
    response_style: ResponseStyle = Field(default_factory=ResponseStyle)
    languages: list[str] = Field(default_factory=list, max_length=20)
    personal_boundaries: list[str] = Field(default_factory=list, max_length=40)
    completed_sections: set[Literal[
        "personality", "interests", "visitor_types", "conversation_dynamics",
        "response_style", "languages", "personal_boundaries",
    ]] = Field(default_factory=set)
    onboarding_complete: bool = False

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        value = " ".join(value.split()) if value is not None else None
        return value or None

    @field_validator("personality", "interests", "visitor_types", "conversation_dynamics", "languages", "personal_boundaries")
    @classmethod
    def clean_lists(cls, values: list[str], info) -> list[str]:
        limit = 40 if info.field_name == "personal_boundaries" else 120
        return _clean_items(values, 40, limit)

    @model_validator(mode="after")
    def validate_onboarding(self):
        if self.onboarding_complete and self.completed_sections != PROFILE_SECTIONS:
            raise ValueError("El onboarding solo puede completarse tras confirmar todas sus secciones.")
        return self

    @property
    def ready(self) -> bool:
        return self.onboarding_complete and self.completed_sections == PROFILE_SECTIONS


class ProfileStore:
    """SQLite account/profile store; construction never seeds an identity or profile."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            with closing(sqlite3.connect(self.path)) as probe:
                version = probe.execute("PRAGMA user_version").fetchone()[0]
                if version not in (0, DATABASE_SCHEMA_VERSION):
                    raise RuntimeError(f"Versión de base de datos no compatible: {version}.")
                exists = probe.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='profiles'").fetchone()
                if exists:
                    columns = {row[1] for row in probe.execute("PRAGMA table_info(profiles)")}
                    if "account_id" not in columns:
                        raise RuntimeError(
                            "La base de perfiles v1.1 requiere migración explícita; no se modificó. "
                            "Usa una ruta PCAI_DATABASE_PATH nueva y la herramienta backend.migrations."
                        )
                    if not {"id", "account_id", "payload", "created_at", "updated_at"}.issubset(columns):
                        raise RuntimeError("El esquema de perfiles existente está incompleto; no se modificó.")
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS model_accounts (
                    id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    artist_name TEXT,
                    platform_user_id TEXT,
                    identity_source TEXT NOT NULL,
                    confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0,1)),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS model_accounts_platform_id_uq
                    ON model_accounts(platform, platform_user_id) WHERE platform_user_id IS NOT NULL;
                CREATE TABLE IF NOT EXISTS account_creation_requests (
                    idempotency_key TEXT PRIMARY KEY,
                    payload_hash TEXT NOT NULL,
                    account_id TEXT NOT NULL REFERENCES model_accounts(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS profiles (
                    id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL REFERENCES model_accounts(id) ON DELETE CASCADE,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS profiles_account_idx ON profiles(account_id);
                CREATE TABLE IF NOT EXISTS account_settings (
                    account_id TEXT PRIMARY KEY REFERENCES model_accounts(id) ON DELETE CASCADE,
                    active_profile_id TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS migration_runs (
                    migration_key TEXT PRIMARY KEY,
                    source_fingerprint TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('started','completed','failed')),
                    legacy_profile_count INTEGER NOT NULL DEFAULT 0,
                    legacy_note_count INTEGER NOT NULL DEFAULT 0,
                    error_code TEXT,
                    started_at TEXT NOT NULL,
                    completed_at TEXT
                );
                CREATE TABLE IF NOT EXISTS legacy_profiles (
                    migration_key TEXT NOT NULL REFERENCES migration_runs(migration_key) ON DELETE CASCADE,
                    legacy_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    was_active INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (migration_key, legacy_id)
                );
                CREATE TABLE IF NOT EXISTS legacy_notes (
                    migration_key TEXT NOT NULL REFERENCES migration_runs(migration_key) ON DELETE CASCADE,
                    legacy_id TEXT NOT NULL,
                    speaker TEXT NOT NULL,
                    speaker_key TEXT NOT NULL,
                    text TEXT NOT NULL,
                    created_at TEXT,
                    updated_at TEXT,
                    PRIMARY KEY (migration_key, legacy_id)
                );
            """)
            db.execute(f"PRAGMA user_version={DATABASE_SCHEMA_VERSION}")

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def list_accounts(self) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM model_accounts ORDER BY created_at,id").fetchall()
            accounts = []
            for row in rows:
                setting = db.execute("SELECT active_profile_id FROM account_settings WHERE account_id=?", (row["id"],)).fetchone()
                profiles = db.execute("SELECT * FROM profiles WHERE account_id=? ORDER BY created_at,id", (row["id"],)).fetchall()
                profile_dicts = [self._profile(profile) for profile in profiles]
                active = next((p for p in profile_dicts if setting and p["id"] == setting["active_profile_id"]), None)
                accounts.append({
                    **self._account(row),
                    "profile_count": len(profiles),
                    "configured": self._is_ready(row, active),
                })
            return accounts

    @staticmethod
    def _account(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"], "platform": row["platform"], "artist_name": row["artist_name"],
            "platform_user_id": row["platform_user_id"], "identity_source": row["identity_source"],
            "confirmed": bool(row["confirmed"]), "created_at": row["created_at"], "updated_at": row["updated_at"],
        }

    def get_account(self, account_id: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM model_accounts WHERE id=?", (account_id,)).fetchone()
            return self._account(row) if row else None

    def create_account(self, payload: AccountInput, idempotency_key: str | None = None) -> dict:
        if idempotency_key is not None and (not re.fullmatch(r"[a-fA-F0-9-]{32,36}", idempotency_key)):
            raise ValueError("La clave de reintento de creación no tiene un formato válido.")
        payload_hash = hashlib.sha256(payload.model_dump_json(exclude_none=False).encode("utf-8")).hexdigest()
        account_id = uuid.uuid4().hex
        now = _now()
        try:
            with self._connect() as db:
                if idempotency_key:
                    previous = db.execute("SELECT payload_hash,account_id FROM account_creation_requests WHERE idempotency_key=?", (idempotency_key,)).fetchone()
                    if previous:
                        if previous["payload_hash"] != payload_hash:
                            raise ValueError("La clave de reintento ya se utilizó con otra identidad. Confirma una nueva creación.")
                        row = db.execute("SELECT * FROM model_accounts WHERE id=?", (previous["account_id"],)).fetchone()
                        if row:
                            return self._account(row)
                db.execute("INSERT INTO model_accounts VALUES (?,?,?,?,?,?,?,?)", (
                    account_id, payload.platform, payload.artist_name, payload.platform_user_id,
                    payload.identity_source, int(payload.confirmed), now, now,
                ))
                db.execute("INSERT INTO account_settings(account_id,active_profile_id,updated_at) VALUES (?,NULL,?)", (account_id, now))
                if idempotency_key:
                    db.execute("INSERT INTO account_creation_requests VALUES (?,?,?,?)", (idempotency_key, payload_hash, account_id, now))
                row = db.execute("SELECT * FROM model_accounts WHERE id=?", (account_id,)).fetchone()
                return self._account(row)
        except sqlite3.IntegrityError as exc:
            if idempotency_key:
                with self._connect() as db:
                    previous = db.execute("SELECT payload_hash,account_id FROM account_creation_requests WHERE idempotency_key=?", (idempotency_key,)).fetchone()
                    if previous and previous["payload_hash"] == payload_hash:
                        row = db.execute("SELECT * FROM model_accounts WHERE id=?", (previous["account_id"],)).fetchone()
                        if row:
                            return self._account(row)
            if payload.platform_user_id:
                raise ValueError("Ya existe una cuenta local con ese identificador de plataforma.") from exc
            raise

    def update_account(self, account_id: str, payload: AccountInput) -> dict | None:
        now = _now()
        try:
            with self._connect() as db:
                cur = db.execute("""UPDATE model_accounts SET platform=?,artist_name=?,platform_user_id=?,
                    identity_source=?,confirmed=?,updated_at=? WHERE id=?""", (
                    payload.platform, payload.artist_name, payload.platform_user_id,
                    payload.identity_source, int(payload.confirmed), now, account_id,
                ))
                if not cur.rowcount:
                    return None
                return self._account(db.execute("SELECT * FROM model_accounts WHERE id=?", (account_id,)).fetchone())
        except sqlite3.IntegrityError as exc:
            raise ValueError("Ya existe una cuenta local con ese identificador de plataforma.") from exc

    def save_profile(self, account_id: str, payload: ProfileInput, profile_id: str | None = None) -> dict:
        now = _now()
        is_create = profile_id is None
        profile_id = profile_id or uuid.uuid4().hex
        with self._connect() as db:
            if not db.execute("SELECT 1 FROM model_accounts WHERE id=?", (account_id,)).fetchone():
                raise KeyError("account")
            existing = db.execute("SELECT id FROM profiles WHERE id=? AND account_id=?", (profile_id, account_id)).fetchone()
            if not is_create and not existing:
                raise KeyError("profile")
            if existing:
                db.execute("UPDATE profiles SET payload=?,updated_at=? WHERE id=? AND account_id=?", (payload.model_dump_json(), now, profile_id, account_id))
            else:
                db.execute("INSERT INTO profiles VALUES (?,?,?,?,?)", (profile_id, account_id, payload.model_dump_json(), now, now))
            if payload.onboarding_complete:
                db.execute("UPDATE account_settings SET active_profile_id=?,updated_at=? WHERE account_id=?", (profile_id, now, account_id))
            row = db.execute("SELECT * FROM profiles WHERE id=? AND account_id=?", (profile_id, account_id)).fetchone()
            return self._profile(row)

    @staticmethod
    def _profile(row: sqlite3.Row) -> dict:
        return {"id": row["id"], "account_id": row["account_id"], **ProfileInput.model_validate_json(row["payload"]).model_dump(mode="json")}

    def snapshot(self, account_id: str) -> dict:
        with self._connect() as db:
            account = db.execute("SELECT * FROM model_accounts WHERE id=?", (account_id,)).fetchone()
            if not account:
                raise KeyError("account")
            setting = db.execute("SELECT active_profile_id FROM account_settings WHERE account_id=?", (account_id,)).fetchone()
            rows = db.execute("SELECT * FROM profiles WHERE account_id=? ORDER BY created_at,id", (account_id,)).fetchall()
            profiles = [self._profile(row) for row in rows]
            active_id = setting["active_profile_id"] if setting else None
            active = next((profile for profile in profiles if profile["id"] == active_id), None)
            return {"account": self._account(account), "active_id": active_id, "onboarding_complete": self._is_ready(account, active), "profiles": profiles}

    @staticmethod
    def _is_ready(account: sqlite3.Row, profile: dict | None) -> bool:
        return bool(account["confirmed"] and account["artist_name"] and profile and profile["onboarding_complete"] and set(profile["completed_sections"]) == PROFILE_SECTIONS)

    def active(self, account_id: str) -> dict | None:
        try:
            snapshot = self.snapshot(account_id)
        except KeyError:
            return None
        return next((profile for profile in snapshot["profiles"] if profile["id"] == snapshot["active_id"]), None)

    def account_ready(self, account_id: str) -> bool:
        try:
            return self.snapshot(account_id)["onboarding_complete"]
        except KeyError:
            return False

    def select(self, account_id: str, profile_id: str) -> dict:
        now = _now()
        with self._connect() as db:
            row = db.execute("SELECT * FROM profiles WHERE id=? AND account_id=?", (profile_id, account_id)).fetchone()
            if not row:
                raise KeyError("profile")
            profile = self._profile(row)
            db.execute("UPDATE account_settings SET active_profile_id=?,updated_at=? WHERE account_id=?", (profile_id, now, account_id))
            return profile

    def delete(self, account_id: str, profile_id: str) -> bool:
        with self._connect() as db:
            cur = db.execute("DELETE FROM profiles WHERE id=? AND account_id=?", (profile_id, account_id))
            if cur.rowcount:
                db.execute("UPDATE account_settings SET active_profile_id=NULL,updated_at=? WHERE account_id=? AND active_profile_id=?", (_now(), account_id, profile_id))
            return cur.rowcount > 0

    def migration_status(self) -> list[dict]:
        with self._connect() as db:
            return [dict(row) for row in db.execute("SELECT migration_key,source_fingerprint,status,legacy_profile_count,legacy_note_count,error_code,started_at,completed_at FROM migration_runs ORDER BY started_at")]


# Compatibility name retained for callers that imported ProfileStore in v1.1.
DEFAULT_PROFILE = None
