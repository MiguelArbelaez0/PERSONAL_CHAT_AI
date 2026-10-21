"""Validated local profiles, independent of conversation memory and model output."""
import json
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class ProfileInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=800)
    tone: str = Field(default="Natural y seguro", max_length=300)
    style: str = Field(default="Breve y directo", max_length=300)
    rules: str = Field(default="", max_length=1000)


DEFAULT_PROFILE = ProfileInput(
    name="ChubbyKriz",
    description="Creador adulto de estilo chubby daddy bear. Identidad segura, confiada y dominante, sin imponerla a conversaciones cotidianas.",
    tone="Seguro, cordial y natural; coqueto y provocador no gráfico solo cuando el contexto y la confianza lo permiten.",
    style="Directo, casual, una o dos frases breves; sin formalidad excesiva.",
    rules="Sin firmas, encabezados ni explicaciones de IA. No acabar siempre con preguntas. No inventar experiencias, recuerdos, promesas ni acciones. Adaptar el tono al interlocutor y respetar sus límites.",
)


class ProfileStore:
    """Separate SQLite file: existing notes and private Markdown remain untouched."""
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS profile_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.execute("INSERT OR IGNORE INTO profiles VALUES (?, ?)", ("default", DEFAULT_PROFILE.model_dump_json()))
            db.execute("INSERT OR IGNORE INTO profile_settings VALUES ('active', 'default')")

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def _read(db, profile_id):
        row = db.execute("SELECT payload FROM profiles WHERE id=?", (profile_id,)).fetchone()
        if not row:
            raise KeyError(profile_id)
        return {"id": profile_id, **ProfileInput.model_validate(json.loads(row[0])).model_dump()}

    def snapshot(self):
        with self._connect() as db:
            active = db.execute("SELECT value FROM profile_settings WHERE key='active'").fetchone()[0]
            ids = [row[0] for row in db.execute("SELECT id FROM profiles ORDER BY rowid")]
            return {"active_id": active, "profiles": [self._read(db, pid) for pid in ids]}

    def active(self):
        with self._connect() as db:
            pid = db.execute("SELECT value FROM profile_settings WHERE key='active'").fetchone()[0]
            return self._read(db, pid)

    def save(self, payload: ProfileInput, profile_id=None):
        pid = profile_id or uuid.uuid4().hex
        with self._connect() as db:
            if profile_id:
                self._read(db, pid)
                db.execute("UPDATE profiles SET payload=? WHERE id=?", (payload.model_dump_json(), pid))
            else:
                db.execute("INSERT INTO profiles VALUES (?, ?)", (pid, payload.model_dump_json()))
            return self._read(db, pid)

    def select(self, profile_id):
        with self._connect() as db:
            result = self._read(db, profile_id)
            db.execute("UPDATE profile_settings SET value=? WHERE key='active'", (profile_id,))
            return result

    def delete(self, profile_id):
        if profile_id == "default":
            raise ValueError("El perfil predeterminado se restaura; no se elimina.")
        with self._connect() as db:
            self._read(db, profile_id)
            db.execute("DELETE FROM profiles WHERE id=?", (profile_id,))
            db.execute("UPDATE profile_settings SET value='default' WHERE key='active' AND value=?", (profile_id,))

    def restore(self):
        # Preserve custom profiles; reset only the built-in profile and selection.
        with self._connect() as db:
            db.execute("UPDATE profiles SET payload=? WHERE id='default'", (DEFAULT_PROFILE.model_dump_json(),))
            db.execute("UPDATE profile_settings SET value='default' WHERE key='active'")
        return self.snapshot()
