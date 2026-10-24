"""Explicit notes scoped to both a model account and a conversation visitor."""
import hashlib
import re
import sqlite3
from contextlib import closing, contextmanager
from pathlib import Path


class LegacyMemorySchemaError(RuntimeError):
    """Raised instead of modifying a v1.1 database in place."""


def normalize_alias(alias: str | None) -> tuple[str, str] | None:
    display = " ".join((alias or "").strip().split())
    if not display:
        return None
    key = hashlib.sha256(display.casefold().encode("utf-8")).hexdigest()
    return key, display[:120]


class MemoryStore:
    def __init__(self, path: Path, max_notes: int = 100):
        self.path, self.max_notes = Path(path), max_notes
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            with closing(sqlite3.connect(self.path)) as probe:
                version = probe.execute("PRAGMA user_version").fetchone()[0]
                if version not in (0, 2):
                    raise RuntimeError(f"Versión de base de datos no compatible: {version}.")
                table = probe.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notes'").fetchone()
                if table:
                    columns = {row[1] for row in probe.execute("PRAGMA table_info(notes)")}
                    if "account_id" not in columns:
                        raise LegacyMemorySchemaError(
                            "La base de memoria v1.1 requiere migración explícita; no se modificó. "
                            "Configura PCAI_DATABASE_PATH con una ruta v1.2 nueva y ejecuta la herramienta de migración."
                        )
                    if not {"id", "account_id", "speaker_key", "speaker", "text", "created_at", "updated_at"}.issubset(columns):
                        raise RuntimeError("El esquema de memoria existente está incompleto; no se modificó.")
        with self._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY,
                account_id TEXT NOT NULL,
                speaker_key TEXT NOT NULL,
                speaker TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            db.execute("CREATE INDEX IF NOT EXISTS notes_account_speaker_idx ON notes(account_id,speaker_key)")

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.execute("PRAGMA secure_delete=ON")
        db.execute("PRAGMA foreign_keys=ON")
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _subject(account_id: str, alias: str | None) -> tuple[str, str, str] | None:
        who = normalize_alias(alias)
        if not account_id or not isinstance(account_id, str) or not who:
            return None
        return account_id, who[0], who[1]

    @staticmethod
    def _row(row: sqlite3.Row) -> dict:
        return dict(id=row["id"], text=row["text"], created_at=row["created_at"], updated_at=row["updated_at"])

    def list_notes(self, account_id: str, alias: str | None) -> list[dict]:
        who = self._subject(account_id, alias)
        if not who or not who[2]:
            return []
        with self._connect() as db:
            rows = db.execute("SELECT id,text,created_at,updated_at FROM notes WHERE account_id=? AND speaker_key=? ORDER BY id DESC LIMIT ?", (who[0], who[1], self.max_notes)).fetchall()
            return [self._row(row) for row in rows]

    def add_note(self, account_id: str, alias: str | None, text: str) -> dict:
        who = self._subject(account_id, alias)
        if not who or not who[2]:
            raise ValueError("Indica una cuenta y un alias para asociar la nota.")
        with self._connect() as db:
            cur = db.execute("INSERT INTO notes(account_id,speaker_key,speaker,text) VALUES(?,?,?,?)", (who[0], who[1], who[2], text.strip()))
            row = db.execute("SELECT id,text,created_at,updated_at FROM notes WHERE id=?", (cur.lastrowid,)).fetchone()
            return self._row(row)

    def relevant_notes(self, account_id: str, alias: str | None, message: str) -> list[dict]:
        """Rank manually saved notes for this exact account/visitor pair."""
        words = set(re.findall(r"[^\W\d_]{3,}", message.casefold()))
        notes = self.list_notes(account_id, alias)
        return sorted(notes, key=lambda note: -len(words & set(re.findall(r"[^\W\d_]{3,}", note["text"].casefold()))))

    def edit_note(self, account_id: str, alias: str | None, note_id: int, text: str) -> dict | None:
        who = self._subject(account_id, alias)
        if not who or not who[2]:
            return None
        with self._connect() as db:
            cur = db.execute("UPDATE notes SET text=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND account_id=? AND speaker_key=?", (text.strip(), note_id, who[0], who[1]))
            if not cur.rowcount:
                return None
            return self._row(db.execute("SELECT id,text,created_at,updated_at FROM notes WHERE id=?", (note_id,)).fetchone())

    def delete_note(self, account_id: str, alias: str | None, note_id: int) -> bool:
        who = self._subject(account_id, alias)
        if not who or not who[2]:
            return False
        with self._connect() as db:
            return db.execute("DELETE FROM notes WHERE id=? AND account_id=? AND speaker_key=?", (note_id, who[0], who[1])).rowcount > 0

    def clear(self, account_id: str, alias: str | None) -> int:
        who = self._subject(account_id, alias)
        if not who or not who[2]:
            return 0
        with self._connect() as db:
            return db.execute("DELETE FROM notes WHERE account_id=? AND speaker_key=?", (who[0], who[1])).rowcount
