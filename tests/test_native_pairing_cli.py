from types import SimpleNamespace

import backend.auth_admin as auth_admin
from backend.security import LocalAuthStore


EXTENSION_ORIGIN = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


def install_auth_path(monkeypatch, path):
    monkeypatch.setattr(auth_admin, "settings", SimpleNamespace(auth_state_path=path))


def test_native_pair_command_emits_only_a_short_lived_code(tmp_path, monkeypatch, capsys):
    auth_path = tmp_path / "auth_state.json"
    install_auth_path(monkeypatch, auth_path)

    assert auth_admin.main(["pair", "--native"]) == 0

    output = capsys.readouterr()
    code = output.out.strip()
    assert 40 <= len(code) <= 64
    assert all(char.isalnum() or char in "_-" for char in code)
    assert output.err == ""
    assert "token" not in output.out.casefold()
    token = LocalAuthStore(auth_path).pair(code, EXTENSION_ORIGIN)
    assert 40 <= len(token) <= 64
    assert token not in output.out


def test_native_rotate_invalidates_old_token_and_does_not_print_it(tmp_path, monkeypatch, capsys):
    auth_path = tmp_path / "auth_state.json"
    install_auth_path(monkeypatch, auth_path)
    store = LocalAuthStore(auth_path)
    old_code = store.issue_pairing_code()
    old_token = store.pair(old_code, EXTENSION_ORIGIN)
    capsys.readouterr()

    assert auth_admin.main(["rotate", "--native"]) == 0
    output = capsys.readouterr()
    new_code = output.out.strip()

    assert 40 <= len(new_code) <= 64
    assert output.err == ""
    assert old_token not in output.out
    assert not store.validate_token(old_token)
    assert store.pair(new_code, EXTENSION_ORIGIN)


def test_native_pair_recovers_when_extension_lost_its_bearer(tmp_path, monkeypatch, capsys):
    auth_path = tmp_path / "auth_state.json"
    install_auth_path(monkeypatch, auth_path)
    store = LocalAuthStore(auth_path)
    initial_code = store.issue_pairing_code()
    old_token = store.pair(initial_code, EXTENSION_ORIGIN)
    capsys.readouterr()

    assert auth_admin.main(["pair", "--native"]) == 0
    output = capsys.readouterr()
    recovery_code = output.out.strip()

    assert 40 <= len(recovery_code) <= 64
    assert not store.validate_token(old_token)
    assert store.pair(recovery_code, EXTENSION_ORIGIN)


def test_native_revoke_clears_token_and_pending_code(tmp_path, monkeypatch, capsys):
    auth_path = tmp_path / "auth_state.json"
    install_auth_path(monkeypatch, auth_path)
    store = LocalAuthStore(auth_path)
    code = store.issue_pairing_code()
    token = store.pair(code, EXTENSION_ORIGIN)
    capsys.readouterr()

    assert auth_admin.main(["revoke", "--native"]) == 0
    output = capsys.readouterr()

    assert output.out.strip() == "ok"
    assert output.err == ""
    assert not store.validate_token(token)
    assert store.issue_pairing_code()
