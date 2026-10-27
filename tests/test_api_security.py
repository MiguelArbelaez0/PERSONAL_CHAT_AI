"""Authentication contract tests; all state and SQLite files are temporary."""

import asyncio
import json

from httpx import ASGITransport, AsyncClient

from backend.config import Settings
from backend.main import create_app
from backend.profiles import AccountInput, ProfileInput, PROFILE_SECTIONS


EXTENSION_A = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
EXTENSION_B = "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
BASE_URL = "http://127.0.0.1:8000"


def make_app(tmp_path):
    return create_app(Settings(
        database_path=tmp_path / "isolated.sqlite3",
        knowledge_path=tmp_path / "knowledge",
        auth_state_path=tmp_path / "auth_state.json",
        port=8000,
    ))


def run(coro):
    return asyncio.run(coro)


async def call(app, method, path, *, token=None, origin=None, host=None, **kwargs):
    headers = dict(kwargs.pop("headers", {}) or {})
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if origin is not None:
        headers["Origin"] = origin
    if host is not None:
        headers["Host"] = host
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as client:
        return await client.request(method, path, headers=headers, **kwargs)


def pair(app, extension_origin=EXTENSION_A):
    code = app.state.auth.issue_pairing_code()
    response = run(call(app, "POST", "/api/auth/pair", origin=extension_origin, json={"pairing_code": code}))
    assert response.status_code == 200, response.text
    return code, response.json()["access_token"]


def test_health_is_minimal_and_public_docs_are_disabled(tmp_path):
    app = make_app(tmp_path)
    health = run(call(app, "GET", "/api/health"))
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "service": "personal-chat-ai"}
    assert run(call(app, "GET", "/openapi.json")).status_code == 401
    assert run(call(app, "GET", "/docs")).status_code == 401


def test_protected_endpoint_requires_bearer_and_rejects_wrong_token(tmp_path):
    app = make_app(tmp_path)
    missing = run(call(app, "GET", "/api/accounts", origin=EXTENSION_A))
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "authentication_required"
    assert missing.headers["www-authenticate"] == "Bearer"

    _, token = pair(app)
    invalid = run(call(app, "GET", "/api/accounts", token="wrong-token", origin=EXTENSION_A))
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "authentication_required"

    allowed = run(call(app, "GET", "/api/accounts", token=token, origin=EXTENSION_A))
    assert allowed.status_code == 200
    assert allowed.json()["accounts"] == []


def test_pairing_needs_an_explicit_code_and_valid_extension_origin(tmp_path):
    app = make_app(tmp_path)
    no_code = run(call(app, "POST", "/api/auth/pair", origin=EXTENSION_A, json={"pairing_code": "x" * 43}))
    assert no_code.status_code == 401
    assert no_code.json()["error"]["code"] == "pairing_code_invalid"

    code = app.state.auth.issue_pairing_code()
    wrong_origin = run(call(app, "POST", "/api/auth/pair", origin="https://es.stripchat.com", json={"pairing_code": code}))
    assert wrong_origin.status_code == 403
    assert wrong_origin.json()["error"]["code"] == "origin_forbidden"

    paired = run(call(app, "POST", "/api/auth/pair", origin=EXTENSION_A, json={"pairing_code": code}))
    assert paired.status_code == 200
    assert paired.json()["token_type"] == "Bearer"
    assert len(paired.json()["access_token"]) >= 40


def test_pairing_code_expiry_and_single_use(tmp_path):
    app = make_app(tmp_path)
    now = [1000.0]
    app.state.auth.clock = lambda: now[0]
    expired_code = app.state.auth.issue_pairing_code()
    now[0] += 301
    expired = run(call(app, "POST", "/api/auth/pair", origin=EXTENSION_A, json={"pairing_code": expired_code}))
    assert expired.status_code == 401

    app.state.auth.clock = lambda: now[0]
    valid_code = app.state.auth.issue_pairing_code()
    first = run(call(app, "POST", "/api/auth/pair", origin=EXTENSION_A, json={"pairing_code": valid_code}))
    assert first.status_code == 200
    replay = run(call(app, "POST", "/api/auth/pair", origin=EXTENSION_A, json={"pairing_code": valid_code}))
    assert replay.status_code == 401


def test_pairing_attempts_are_limited(tmp_path):
    app = make_app(tmp_path)
    code = app.state.auth.issue_pairing_code()
    for _ in range(app.state.auth.max_pairing_attempts):
        rejected = run(call(app, "POST", "/api/auth/pair", origin=EXTENSION_A, json={"pairing_code": "x" * 43}))
        assert rejected.status_code == 401
    final = run(call(app, "POST", "/api/auth/pair", origin=EXTENSION_A, json={"pairing_code": code}))
    assert final.status_code == 401


def test_corrupt_auth_state_fails_closed_without_disclosing_contents(tmp_path):
    app = make_app(tmp_path)
    app.state.auth.path.write_text("{invalid", encoding="utf-8")
    response = run(call(app, "GET", "/api/accounts", token="synthetic-token", origin=EXTENSION_A))
    assert response.status_code == 503
    assert "invalid" not in response.text


def test_bad_host_and_wrong_paired_origin_are_forbidden(tmp_path):
    app = make_app(tmp_path)
    bad_host = run(call(app, "GET", "/api/health", host="localhost:8000"))
    assert bad_host.status_code == 403
    assert bad_host.json()["error"]["code"] == "host_forbidden"

    _, token = pair(app)
    wrong_origin = run(call(app, "GET", "/api/accounts", token=token, origin=EXTENSION_B))
    assert wrong_origin.status_code == 403
    assert wrong_origin.json()["error"]["code"] == "origin_forbidden"


def test_authorization_header_allows_extension_preflight_and_local_cli(tmp_path):
    app = make_app(tmp_path)
    _, token = pair(app)
    preflight = run(call(
        app, "OPTIONS", "/api/accounts", origin=EXTENSION_A,
        headers={"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"},
    ))
    assert preflight.status_code == 200
    assert "authorization" in preflight.headers.get("access-control-allow-headers", "").casefold()
    page_origin = run(call(
        app, "OPTIONS", "/api/accounts", origin="https://es.stripchat.com",
        headers={"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"},
    ))
    assert page_origin.status_code == 200
    assert page_origin.headers.get("access-control-allow-origin") == "https://es.stripchat.com"
    page_request = run(call(app, "GET", "/api/accounts", token=token, origin="https://es.stripchat.com"))
    assert page_request.status_code == 403
    local_cli = run(call(app, "GET", "/api/accounts", token=token))
    assert local_cli.status_code == 200


def test_delete_requires_auth_and_account_memory_remain_isolated(tmp_path):
    app = make_app(tmp_path)
    first = app.state.profiles.create_account(AccountInput(
        platform="stripchat", artist_name="Synthetic A", identity_source="manual", confirmed=True,
    ))
    second = app.state.profiles.create_account(AccountInput(
        platform="stripchat", artist_name="Synthetic B", identity_source="manual", confirmed=True,
    ))
    profile = ProfileInput(
        name="Synthetic", personality=["warm"], interests=["music"], visitor_types=["regular"],
        conversation_dynamics=["friendly"], response_style={"tone": ["natural"], "length": "short"},
        languages=["en"], personal_boundaries=["synthetic"], completed_sections=PROFILE_SECTIONS,
        onboarding_complete=True,
    )
    saved = app.state.profiles.save_profile(first["id"], profile)
    app.state.memory.add_note(first["id"], "SyntheticVisitor", "synthetic note A")
    app.state.memory.add_note(second["id"], "SyntheticVisitor", "synthetic note B")

    blocked = run(call(app, "DELETE", f"/api/accounts/{first['id']}/profiles/{saved['id']}", origin=EXTENSION_A))
    assert blocked.status_code == 401
    assert app.state.profiles.snapshot(first["id"])["profiles"]

    _, token = pair(app)
    deleted = run(call(app, "DELETE", f"/api/accounts/{first['id']}/profiles/{saved['id']}", token=token, origin=EXTENSION_A))
    assert deleted.status_code == 204

    notes_a = run(call(app, "GET", f"/api/memory/SyntheticVisitor?account_id={first['id']}", token=token, origin=EXTENSION_A)).json()["notes"]
    notes_b = run(call(app, "GET", f"/api/memory/SyntheticVisitor?account_id={second['id']}", token=token, origin=EXTENSION_A)).json()["notes"]
    assert [note["text"] for note in notes_a] == ["synthetic note A"]
    assert [note["text"] for note in notes_b] == ["synthetic note B"]


def test_recovery_rotation_revokes_old_token(tmp_path):
    app = make_app(tmp_path)
    _, old_token = pair(app)
    recovered_code = app.state.auth.issue_pairing_code(rotate=True)
    old_access = run(call(app, "GET", "/api/accounts", token=old_token, origin=EXTENSION_A))
    assert old_access.status_code == 401

    paired = run(call(app, "POST", "/api/auth/pair", origin=EXTENSION_B, json={"pairing_code": recovered_code}))
    assert paired.status_code == 200
    new_token = paired.json()["access_token"]
    access = run(call(app, "GET", "/api/accounts", token=new_token, origin=EXTENSION_B))
    assert access.status_code == 200


def test_credentials_are_not_persisted_or_logged(tmp_path, caplog):
    app = make_app(tmp_path)
    code, token = pair(app)
    stored = app.state.auth.path.read_text(encoding="utf-8")
    assert code not in stored
    assert token not in stored
    assert json.loads(stored)["token_hash"]
    assert code not in caplog.text
    assert token not in caplog.text
