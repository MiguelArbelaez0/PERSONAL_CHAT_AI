"""Explicit, restartable import of v1.1 SQLite data into a v1.2 store.

This module only opens the source databases read-only. Run it explicitly with
``python -m backend.migrations``; application startup never imports legacy data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from backend.config import settings
from backend.profiles import ProfileStore

MIGRATION_KEY = "v1.1-to-v1.2-legacy-import"


class MigrationError(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _fingerprint(paths: tuple[Path, ...]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(str(path.resolve()).encode("utf-8"))
        if path.exists():
            for suffix in ("", "-wal", "-shm"):
                candidate = Path(str(path) + suffix)
                digest.update(suffix.encode())
                if candidate.is_file():
                    digest.update(candidate.read_bytes())
        else:
            digest.update(b"missing")
    return digest.hexdigest()


def _open_readonly(path: Path):
    uri = path.resolve().as_uri() + "?mode=ro"
    return sqlite3.connect(uri, uri=True, timeout=5)


def _read_profiles(path: Path) -> tuple[list[dict], str | None]:
    if not path.exists():
        return [], None
    try:
        with closing(_open_readonly(path)) as source:
            source.row_factory = sqlite3.Row
            integrity = source.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise MigrationError("La base de perfiles de origen no pasó integrity_check.")
            tables = {row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if "profiles" not in tables:
                return [], None
            cols = {row[1] for row in source.execute("PRAGMA table_info(profiles)")}
            if not {"id", "payload"}.issubset(cols):
                raise MigrationError("El esquema de perfiles de origen no coincide con v1.1.")
            rows = [dict(row) for row in source.execute("SELECT id,payload FROM profiles ORDER BY rowid")]
            for row in rows:
                if not isinstance(row["payload"], str):
                    raise MigrationError("La base contiene un perfil heredado no válido.")
                json.loads(row["payload"])
            active = None
            if "profile_settings" in tables:
                setting_cols = {row[1] for row in source.execute("PRAGMA table_info(profile_settings)")}
                if {"key", "value"}.issubset(setting_cols):
                    found = source.execute("SELECT value FROM profile_settings WHERE key='active'").fetchone()
                    active = found[0] if found else None
            return rows, active
    except sqlite3.Error as exc:
        raise MigrationError("No se pudo leer la base de perfiles de origen.") from exc


def _read_notes(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        with closing(_open_readonly(path)) as source:
            source.row_factory = sqlite3.Row
            integrity = source.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise MigrationError("La base de memoria de origen no pasó integrity_check.")
            tables = {row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if "notes" not in tables:
                return []
            cols = {row[1] for row in source.execute("PRAGMA table_info(notes)")}
            required = {"id", "speaker_key", "speaker", "text"}
            if not required.issubset(cols):
                raise MigrationError("El esquema de memoria de origen no coincide con v1.1.")
            selected = [name for name in ("id", "speaker_key", "speaker", "text", "created_at", "updated_at") if name in cols]
            query = "SELECT " + ",".join(selected) + " FROM notes ORDER BY id"
            rows = [dict(row) for row in source.execute(query)]
            for row in rows:
                if not isinstance(row["text"], str) or not isinstance(row["speaker_key"], str):
                    raise MigrationError("La base contiene una nota heredada no válida.")
            return rows
    except sqlite3.Error as exc:
        raise MigrationError("No se pudo leer la base de memoria de origen.") from exc


def migrate_v11_data(
    source_memory_path: Path,
    source_profiles_path: Path,
    target_path: Path,
    *,
    failpoint=None,
) -> dict:
    """Copy v1.1 data into an isolated legacy area, leaving both sources untouched."""
    source_memory_path = Path(source_memory_path).resolve()
    source_profiles_path = Path(source_profiles_path).resolve()
    target_path = Path(target_path).resolve()
    if target_path in {source_memory_path, source_profiles_path}:
        raise MigrationError("El destino debe ser distinto de ambas bases originales.")

    # Read and validate sources fully before creating migration state in the target.
    notes = _read_notes(source_memory_path)
    profiles, active_profile_id = _read_profiles(source_profiles_path)
    fingerprint = _fingerprint((source_memory_path, source_profiles_path))
    store = ProfileStore(target_path)
    recovered = False
    now = _now()

    with store._connect() as db:
        previous = db.execute("SELECT * FROM migration_runs WHERE migration_key=?", (MIGRATION_KEY,)).fetchone()
        if previous and previous["status"] == "completed":
            if previous["source_fingerprint"] != fingerprint:
                raise MigrationError("Las fuentes cambiaron después de completar la migración; no se reimportaron.")
            return {
                "status": "completed", "already_completed": True,
                "legacy_profiles": previous["legacy_profile_count"],
                "legacy_notes": previous["legacy_note_count"],
                "source_unchanged": True,
            }
        recovered = bool(previous and previous["status"] == "started")
        db.execute("""INSERT INTO migration_runs(migration_key,source_fingerprint,status,started_at)
            VALUES(?,?, 'started', ?) ON CONFLICT(migration_key) DO UPDATE SET
            source_fingerprint=excluded.source_fingerprint,status='started',error_code=NULL,
            started_at=excluded.started_at,completed_at=NULL""", (MIGRATION_KEY, fingerprint, now))

    try:
        with store._connect() as db:
            # A started run is safe to replay: remove only this run's legacy rows
            # within the same transaction that will replace them.
            db.execute("DELETE FROM legacy_profiles WHERE migration_key=?", (MIGRATION_KEY,))
            db.execute("DELETE FROM legacy_notes WHERE migration_key=?", (MIGRATION_KEY,))
            db.executemany(
                "INSERT INTO legacy_profiles(migration_key,legacy_id,payload,was_active) VALUES(?,?,?,?)",
                [(MIGRATION_KEY, str(row["id"]), row["payload"], int(str(row["id"]) == str(active_profile_id))) for row in profiles],
            )
            db.executemany(
                """INSERT INTO legacy_notes(migration_key,legacy_id,speaker,speaker_key,text,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?)""",
                [(MIGRATION_KEY, str(row["id"]), str(row["speaker"]), str(row["speaker_key"]), str(row["text"]),
                  row.get("created_at"), row.get("updated_at")) for row in notes],
            )
            if failpoint:
                failpoint()
            copied_profiles = db.execute("SELECT COUNT(*) FROM legacy_profiles WHERE migration_key=?", (MIGRATION_KEY,)).fetchone()[0]
            copied_notes = db.execute("SELECT COUNT(*) FROM legacy_notes WHERE migration_key=?", (MIGRATION_KEY,)).fetchone()[0]
            if copied_profiles != len(profiles) or copied_notes != len(notes):
                raise MigrationError("La verificación de recuentos de la copia no coincide.")
            db.execute("""UPDATE migration_runs SET status='completed',legacy_profile_count=?,
                legacy_note_count=?,completed_at=?,error_code=NULL WHERE migration_key=?""",
                (copied_profiles, copied_notes, _now(), MIGRATION_KEY))
        return {
            "status": "completed", "already_completed": False, "recovered_previous_run": recovered,
            "legacy_profiles": len(profiles), "legacy_notes": len(notes),
            "source_unchanged": True,
        }
    except Exception as exc:
        with store._connect() as db:
            db.execute("UPDATE migration_runs SET status='failed',error_code=?,completed_at=NULL WHERE migration_key=?", (type(exc).__name__, MIGRATION_KEY))
        if isinstance(exc, MigrationError):
            raise
        raise MigrationError("La importación falló y puede reintentarse; las bases originales no se modificaron.") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa datos v1.1 al espacio heredado v1.2 sin escribir las fuentes.")
    parser.add_argument("--source-memory", type=Path, default=settings.legacy_database_path)
    parser.add_argument("--source-profiles", type=Path, default=settings.legacy_profiles_path)
    parser.add_argument("--target", type=Path, default=settings.database_path)
    args = parser.parse_args()
    try:
        report = migrate_v11_data(args.source_memory, args.source_profiles, args.target)
    except MigrationError as exc:
        parser.exit(2, f"Migración detenida: {exc}\n")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
