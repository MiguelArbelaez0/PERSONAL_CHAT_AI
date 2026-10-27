"""Account, profile, and isolated v1.1 migration tests using temporary SQLite files."""
import hashlib
import json
import re
import sqlite3

import pytest
from pydantic import ValidationError

from backend.config import Settings
from backend.main import create_app
from backend.memory import MemoryStore
from backend.migrations import MIGRATION_KEY, migrate_v11_data
from backend.profiles import (
    AccountInput, ProfileInput, ProfileStore, PROFILE_SECTIONS,
)
from test_app import FakeLLM, request


def ready_profile(name="Synthetic profile"):
    return ProfileInput(
        name=name, personality=["warm"], interests=["music"],
        visitor_types=["regular visitor"], conversation_dynamics=["friendly"],
        response_style={"tone": ["natural"], "length": "short"},
        languages=["en", "es"], personal_boundaries=["No personal data"],
        completed_sections=PROFILE_SECTIONS, onboarding_complete=True,
    )


def empty_app(tmp_path, llm=None):
    return create_app(Settings(
        database_path=tmp_path / "v12.sqlite3", knowledge_path=tmp_path / "knowledge",
        auth_state_path=tmp_path / "auth_state.json",
    ), llm=llm or FakeLLM())


def make_v11_sources(tmp_path):
    memory = tmp_path / "personal_chat_ai.sqlite3"
    profiles = tmp_path / "personalities.sqlite3"
    with sqlite3.connect(memory) as db:
        db.execute("""CREATE TABLE notes (
            id INTEGER PRIMARY KEY, speaker_key TEXT NOT NULL, speaker TEXT NOT NULL,
            text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
        db.execute("INSERT INTO notes(speaker_key,speaker,text) VALUES(?,?,?)", ("hash-ana", "Ana", "Legacy note sentinel"))
    with sqlite3.connect(profiles) as db:
        db.execute("CREATE TABLE profiles (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        db.execute("CREATE TABLE profile_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.execute("INSERT INTO profiles VALUES(?,?)", ("default", json.dumps({"name": "ChubbyKriz", "description": "legacy profile"})))
        db.execute("INSERT INTO profiles VALUES(?,?)", ("custom", json.dumps({"name": "Custom", "tone": "calm"})))
        db.execute("INSERT INTO profile_settings VALUES('active','custom')")
    return memory, profiles


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_clean_install_has_no_accounts_profiles_or_personality_and_blocks_generation(tmp_path):
    llm = FakeLLM()
    app = empty_app(tmp_path, llm)
    assert app.state.profiles.list_accounts() == []
    result = request(app, "POST", "/api/suggestions", json={"message": "Hello"})
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "onboarding_required"
    assert llm.last_messages is None


def test_account_identity_is_stable_independent_of_artist_name_and_has_timestamps(tmp_path):
    store = ProfileStore(tmp_path / "accounts.sqlite3")
    account = store.create_account(AccountInput(platform="stripchat", artist_name="Same Name", confirmed=True))
    other = store.create_account(AccountInput(platform="stripchat", artist_name="Same Name", confirmed=True))
    assert account["id"] != other["id"]
    assert account["identity_source"] == "manual"
    assert account["created_at"] and account["updated_at"]
    changed = store.update_account(account["id"], AccountInput(
        platform="stripchat", artist_name="New Stage Name", platform_user_id="sc-42",
        identity_source="dom", confirmed=True,
    ))
    assert changed["id"] == account["id"]
    assert changed["artist_name"] == "New Stage Name"
    assert changed["updated_at"] >= account["updated_at"]
    assert store.update_account("missing", AccountInput(confirmed=False)) is None


def test_account_creation_idempotency_recovers_same_uuid_and_rejects_key_reuse(tmp_path):
    app = empty_app(tmp_path)
    request_header_name = "Idempotency" + "-Key"
    request_header_value = "0123456789abcdef" * 2
    headers = {request_header_name: request_header_value}
    payload = {"artist_name": "Retry Star", "confirmed": True, "identity_source": "dom"}
    first = request(app, "POST", "/api/accounts", json=payload, headers=headers)
    retry = request(app, "POST", "/api/accounts", json=payload, headers=headers)
    assert first.status_code == 201
    assert retry.status_code == 201
    assert retry.json()["id"] == first.json()["id"]
    assert re.fullmatch(r"[0-9a-f]{32}", first.json()["id"]), "backend account UUIDs use compact uuid4().hex form"
    assert len(request(app, "GET", "/api/accounts").json()["accounts"]) == 1
    changed = request(app, "POST", "/api/accounts", json={**payload, "artist_name": "Other Star"}, headers=headers)
    assert changed.status_code == 409
    assert len(request(app, "GET", "/api/accounts").json()["accounts"]) == 1


def test_stripchat_cors_preflight_allows_account_idempotency_header_only_for_allowed_origin(tmp_path):
    app = empty_app(tmp_path)
    headers = {
        "Origin": "https://es.stripchat.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,idempotency-key",
    }
    allowed = request(app, "OPTIONS", "/api/accounts", headers=headers)
    assert allowed.status_code == 200
    assert "idempotency-key" in allowed.headers["access-control-allow-headers"].lower()
    denied = request(app, "OPTIONS", "/api/accounts", headers={**headers, "Origin": "https://example.com"})
    assert denied.status_code == 400


def test_account_list_includes_configuration_metadata_for_duplicate_names(tmp_path):
    app = empty_app(tmp_path)
    first = request(app, "POST", "/api/accounts", json={"artist_name": "Same", "confirmed": True}).json()
    second = request(app, "POST", "/api/accounts", json={"artist_name": "Same", "confirmed": True}).json()
    accounts = request(app, "GET", "/api/accounts").json()["accounts"]
    assert len(accounts) == 2
    assert len({item["id"] for item in accounts}) == 2
    assert all(item["profile_count"] == 0 and item["configured"] is False for item in accounts)
    assert first["id"] != second["id"]


def test_platform_user_id_is_unique_only_when_present_and_confirmed_requires_name(tmp_path):
    with pytest.raises(ValidationError):
        AccountInput(platform="stripchat", confirmed=True)
    store = ProfileStore(tmp_path / "accounts.sqlite3")
    store.create_account(AccountInput(platform="stripchat", artist_name="One", platform_user_id="id-1", confirmed=True))
    with pytest.raises(ValueError):
        store.create_account(AccountInput(platform="stripchat", artist_name="Two", platform_user_id="id-1", confirmed=True))


@pytest.mark.parametrize("payload", [
    {"schema_version": 3},
    {"personality": ["x" * 121]},
    {"interests": ["x"] * 31},
    {"response_style": {"length": "huge"}},
    {"languages": ["x" * 121]},
    {"completed_sections": ["unknown"], "onboarding_complete": True},
])
def test_profile_fields_and_onboarding_state_are_validated(payload):
    with pytest.raises(ValidationError):
        ProfileInput.model_validate(payload)


def test_profiles_and_memory_are_isolated_by_account_and_visitor(tmp_path):
    path = tmp_path / "accounts.sqlite3"
    profiles = ProfileStore(path)
    memory = MemoryStore(path)
    one = profiles.create_account(AccountInput(artist_name="Same", confirmed=True))
    two = profiles.create_account(AccountInput(artist_name="Same", confirmed=True))
    profile = profiles.save_profile(one["id"], ready_profile("One"))
    assert profiles.account_ready(one["id"])
    assert profiles.snapshot(two["id"])["profiles"] == []
    assert profiles.account_ready(two["id"]) is False
    memory.add_note(one["id"], "Visitor", "one-only")
    memory.add_note(two["id"], "Visitor", "two-only")
    assert [item["text"] for item in memory.list_notes(one["id"], "Visitor")] == ["one-only"]
    assert [item["text"] for item in memory.list_notes(two["id"], "Visitor")] == ["two-only"]
    with pytest.raises(KeyError):
        profiles.select(two["id"], profile["id"])


def test_generation_requires_confirmed_account_and_completed_profile(tmp_path):
    llm = FakeLLM()
    app = empty_app(tmp_path, llm)
    account = request(app, "POST", "/api/accounts", json={"artist_name": "Pending", "confirmed": False})
    account_id = account.json()["id"]
    pending = request(app, "POST", "/api/suggestions", json={"message": "Hello", "model_account_id": account_id})
    assert pending.status_code == 409
    assert pending.json()["error"]["code"] == "account_unconfirmed"
    assert llm.last_messages is None

    request(app, "PUT", f"/api/accounts/{account_id}", json={"artist_name": "Confirmed", "confirmed": True, "identity_source": "manual"})
    not_ready = request(app, "POST", "/api/suggestions", json={"message": "Hello", "model_account_id": account_id})
    assert not_ready.status_code == 409
    assert not_ready.json()["error"]["code"] == "onboarding_required"
    assert llm.last_messages is None

    saved = request(app, "POST", f"/api/accounts/{account_id}/profiles", json=ready_profile().model_dump(mode="json"))
    assert saved.status_code == 201
    response = request(app, "POST", "/api/suggestions", json={"message": "Hello, how are you?", "model_account_id": account_id})
    assert response.status_code == 200
    assert response.json()["model_account_id"] == account_id


def test_account_is_required_when_more_than_one_exists(tmp_path):
    app = empty_app(tmp_path)
    for name in ("A", "B"):
        request(app, "POST", "/api/accounts", json={"artist_name": name, "confirmed": True})
    result = request(app, "POST", "/api/suggestions", json={"message": "Hello"})
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "account_required"


def test_profile_api_rejects_cross_account_profile_access(tmp_path):
    app = empty_app(tmp_path)
    first = request(app, "POST", "/api/accounts", json={"artist_name": "First", "confirmed": True}).json()
    second = request(app, "POST", "/api/accounts", json={"artist_name": "Second", "confirmed": True}).json()
    profile = request(
        app, "POST", f"/api/accounts/{first['id']}/profiles",
        json=ready_profile().model_dump(mode="json"),
    ).json()

    assert request(app, "GET", f"/api/accounts/{second['id']}/profiles").json()["profiles"] == []
    edit = request(
        app, "PUT", f"/api/accounts/{second['id']}/profiles/{profile['id']}",
        json=ready_profile("Cross-account edit").model_dump(mode="json"),
    )
    activate = request(app, "POST", f"/api/accounts/{second['id']}/profiles/{profile['id']}/activate")
    delete = request(app, "DELETE", f"/api/accounts/{second['id']}/profiles/{profile['id']}")
    assert edit.status_code == activate.status_code == delete.status_code == 404
    assert app.state.profiles.active(first["id"])["name"] == "Synthetic profile"


def test_memory_endpoints_scope_legacy_compatible_calls_to_the_only_account(tmp_path):
    app = empty_app(tmp_path)
    account = request(app, "POST", "/api/accounts", json={"artist_name": "Model", "confirmed": True}).json()
    created = request(app, "POST", "/api/memory/Ana/notes", json={"text": "note"}, params={"account_id": account["id"]})
    assert created.status_code == 201
    listed = request(app, "GET", "/api/memory/Ana", params={"account_id": account["id"]}).json()
    assert listed["account_id"] == account["id"]
    assert listed["notes"][0]["text"] == "note"
    other = request(app, "POST", "/api/accounts", json={"artist_name": "Other", "confirmed": True}).json()
    assert request(app, "GET", "/api/memory/Ana").status_code == 409
    assert request(app, "GET", "/api/memory/Ana", params={"account_id": other["id"]}).json()["notes"] == []


def test_v11_migration_copies_to_legacy_area_without_changing_sources_and_is_idempotent(tmp_path):
    memory, profiles = make_v11_sources(tmp_path)
    before = (file_hash(memory), file_hash(profiles))
    target = tmp_path / "v12.sqlite3"
    report = migrate_v11_data(memory, profiles, target)
    assert report == {
        "status": "completed", "already_completed": False, "recovered_previous_run": False,
        "legacy_profiles": 2, "legacy_notes": 1, "source_unchanged": True,
    }
    store = ProfileStore(target)
    assert store.list_accounts() == []
    assert store.migration_status()[0]["status"] == "completed"
    with sqlite3.connect(target) as db:
        assert db.execute("SELECT COUNT(*) FROM profiles").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM legacy_profiles").fetchone()[0] == 2
        assert db.execute("SELECT COUNT(*) FROM legacy_notes").fetchone()[0] == 1
        active = db.execute("SELECT legacy_id FROM legacy_profiles WHERE was_active=1").fetchone()[0]
        assert active == "custom"
        assert db.execute("SELECT payload FROM legacy_profiles WHERE legacy_id='default'").fetchone()[0].find("ChubbyKriz") >= 0
    again = migrate_v11_data(memory, profiles, target)
    assert again["already_completed"] is True
    with sqlite3.connect(target) as db:
        assert db.execute("SELECT COUNT(*) FROM legacy_profiles").fetchone()[0] == 2
        assert db.execute("SELECT COUNT(*) FROM legacy_notes").fetchone()[0] == 1
    assert (file_hash(memory), file_hash(profiles)) == before


def test_interrupted_migration_replays_without_duplicates(tmp_path):
    memory, profiles = make_v11_sources(tmp_path)
    target = tmp_path / "v12.sqlite3"

    class SimulatedCrash(BaseException):
        pass

    def crash():
        raise SimulatedCrash()

    with pytest.raises(SimulatedCrash):
        migrate_v11_data(memory, profiles, target, failpoint=crash)
    status = ProfileStore(target).migration_status()
    assert status[0]["migration_key"] == MIGRATION_KEY
    assert status[0]["status"] == "started"
    report = migrate_v11_data(memory, profiles, target)
    assert report["recovered_previous_run"] is True
    assert report["legacy_profiles"] == 2 and report["legacy_notes"] == 1
    with sqlite3.connect(target) as db:
        assert db.execute("SELECT COUNT(*) FROM legacy_profiles").fetchone()[0] == 2
        assert db.execute("SELECT COUNT(*) FROM legacy_notes").fetchone()[0] == 1


def test_migration_rejects_same_source_and_target_and_preserves_source_on_error(tmp_path):
    memory, profiles = make_v11_sources(tmp_path)
    before = (file_hash(memory), file_hash(profiles))
    with pytest.raises(Exception, match="distinto"):
        migrate_v11_data(memory, profiles, memory)
    assert (file_hash(memory), file_hash(profiles)) == before


def test_existing_v11_databases_are_not_opened_as_v12_targets(tmp_path):
    memory, profiles = make_v11_sources(tmp_path)
    with pytest.raises(RuntimeError, match="requiere migración explícita"):
        MemoryStore(memory)
    with pytest.raises(RuntimeError, match="requiere migración explícita"):
        ProfileStore(profiles)


def test_unknown_database_schema_version_is_rejected_without_mutation(tmp_path):
    path = tmp_path / "future.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA user_version=3")
        db.execute("CREATE TABLE marker(value TEXT)")
        db.execute("INSERT INTO marker VALUES('preserve')")
    before = file_hash(path)
    with pytest.raises(RuntimeError, match="Versión de base de datos no compatible"):
        ProfileStore(path)
    with pytest.raises(RuntimeError, match="Versión de base de datos no compatible"):
        MemoryStore(path)
    assert file_hash(path) == before
