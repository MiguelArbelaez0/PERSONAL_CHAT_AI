import hashlib
import sqlite3
from contextlib import contextmanager
from pathlib import Path


def normalize_alias(alias: str | None) -> tuple[str, str] | None:
    display = " ".join((alias or "").strip().split())
    if not display:
        return None
    key = hashlib.sha256(display.casefold().encode("utf-8")).hexdigest()
    return key, display[:120]


class MemoryStore:
    def __init__(self, path: Path, max_notes: int = 100):
        self.path, self.max_notes = path, max_notes
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, speaker_key TEXT NOT NULL, speaker TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
            db.execute("CREATE INDEX IF NOT EXISTS notes_speaker_idx ON notes(speaker_key)")

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def list_notes(self, alias: str | None) -> list[dict]:
        who = normalize_alias(alias)
        if not who:
            return []
        with self._connect() as db:
            rows = db.execute("SELECT id,text,created_at,updated_at FROM notes WHERE speaker_key=? ORDER BY id DESC LIMIT ?", (who[0], self.max_notes)).fetchall()
            return [dict(id=r["id"], text=r["text"], created_at=r["created_at"], updated_at=r["updated_at"]) for r in rows]

    def add_note(self, alias: str | None, text: str) -> dict:
        who = normalize_alias(alias)
        if not who:
            raise ValueError("Indica un alias para asociar la nota.")
        with self._connect() as db:
            cur = db.execute("INSERT INTO notes(speaker_key,speaker,text) VALUES(?,?,?)", (who[0], who[1], text.strip()))
            row = db.execute("SELECT id,text,created_at,updated_at FROM notes WHERE id=?", (cur.lastrowid,)).fetchone()
            return dict(id=row["id"], text=row["text"], created_at=row["created_at"], updated_at=row["updated_at"])

    def edit_note(self, alias: str | None, note_id: int, text: str) -> dict | None:
        who = normalize_alias(alias)
        if not who:
            return None
        with self._connect() as db:
            cur = db.execute("UPDATE notes SET text=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND speaker_key=?", (text.strip(), note_id, who[0]))
            if not cur.rowcount:
                return None
            row = db.execute("SELECT id,text,created_at,updated_at FROM notes WHERE id=?", (note_id,)).fetchone()
            return dict(id=row["id"], text=row["text"], created_at=row["created_at"], updated_at=row["updated_at"])

    def delete_note(self, alias: str | None, note_id: int) -> bool:
        who = normalize_alias(alias)
        if not who:
            return False
        with self._connect() as db:
            return db.execute("DELETE FROM notes WHERE id=? AND speaker_key=?", (note_id, who[0])).rowcount > 0

    def clear(self, alias: str | None) -> int:
        who = normalize_alias(alias)
        if not who:
            return 0
        with self._connect() as db:
            return db.execute("DELETE FROM notes WHERE speaker_key=?", (who[0],)).rowcount
