"""Local, explicitly paired bearer authentication for the FastAPI backend.

Raw pairing codes and access tokens are never written to disk or logged. The
state file contains only SHA-256 verifiers; generated credentials have 256 bits
of entropy. The file lives in the current user's OS data directory.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


_EXTENSION_ORIGIN = re.compile(r"^chrome-extension://[a-p]{32}$")
_STATE_VERSION = 1
PAIRING_TTL_SECONDS = 300
PAIRING_MAX_ATTEMPTS = 5


class PairingRequest(BaseModel):
    pairing_code: str = Field(min_length=40, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class AuthStateError(RuntimeError):
    """Authentication state could not be safely read or written."""


class PairingUnavailable(RuntimeError):
    """No valid, unused pairing code is available."""


class AlreadyPaired(RuntimeError):
    """Pairing must be explicitly rotated before another extension can pair."""


def is_chrome_extension_origin(origin: str | None) -> bool:
    return bool(origin and _EXTENSION_ORIGIN.fullmatch(origin))


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class LocalAuthStore:
    """Atomic, cross-process guarded state for a single local extension pairing."""

    def __init__(
        self,
        path: Path,
        *,
        pairing_ttl_seconds: int = PAIRING_TTL_SECONDS,
        max_pairing_attempts: int = PAIRING_MAX_ATTEMPTS,
        clock: Callable[[], float] | None = None,
    ):
        self.path = Path(path).expanduser().resolve()
        self.pairing_ttl_seconds = pairing_ttl_seconds
        self.max_pairing_attempts = max_pairing_attempts
        self.clock = clock or time.time

    @contextmanager
    def _locked(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if os.name != "nt":
            os.chmod(self.path.parent, 0o700)
        lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        with lock_path.open("a+b") as lock_file:
            if os.name != "nt":
                os.chmod(lock_path, 0o600)
            if os.name == "nt":
                import msvcrt

                lock_file.seek(0, os.SEEK_END)
                if lock_file.tell() == 0:
                    lock_file.write(b"\0")
                    lock_file.flush()
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
                try:
                    yield
                finally:
                    lock_file.seek(0)
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
                try:
                    yield
                finally:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def _read_unlocked(self) -> dict:
        try:
            raw = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return {"version": _STATE_VERSION, "token_hash": None, "extension_origin": None, "pairing": None}
        except (OSError, UnicodeError) as exc:
            raise AuthStateError("No se pudo leer el estado de autenticación local.") from exc
        try:
            state = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise AuthStateError("El estado de autenticación local está dañado; se requiere recuperación manual.") from exc
        if not isinstance(state, dict) or state.get("version") != _STATE_VERSION:
            raise AuthStateError("La versión del estado de autenticación local no es compatible.")
        token_hash = state.get("token_hash")
        origin = state.get("extension_origin")
        pairing = state.get("pairing")
        if token_hash is not None and (not isinstance(token_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", token_hash)):
            raise AuthStateError("El estado de autenticación local no supera la validación de integridad.")
        if origin is not None and (not isinstance(origin, str) or not is_chrome_extension_origin(origin)):
            raise AuthStateError("El estado de autenticación local no supera la validación de integridad.")
        if (token_hash is None) != (origin is None) or (token_hash is not None and state.get("pairing") is not None):
            raise AuthStateError("El estado de autenticación local no supera la validación de integridad.")
        if pairing is not None:
            if (
                not isinstance(pairing, dict)
                or not isinstance(pairing.get("code_hash"), str)
                or not re.fullmatch(r"[0-9a-f]{64}", pairing["code_hash"])
                or isinstance(pairing.get("expires_at"), bool)
                or not isinstance(pairing.get("expires_at"), int)
                or isinstance(pairing.get("attempts"), bool)
                or not isinstance(pairing.get("attempts"), int)
                or pairing["attempts"] < 0
            ):
                raise AuthStateError("El estado de autenticación local no supera la validación de integridad.")
        return state

    def _write_unlocked(self, state: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp_name = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=self.path.parent,
                prefix=f".{self.path.name}.", suffix=".tmp", delete=False,
            ) as stream:
                temp_name = stream.name
                if os.name != "nt":
                    os.chmod(temp_name, 0o600)
                json.dump(state, stream, separators=(",", ":"), sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_name, self.path)
            if os.name != "nt":
                os.chmod(self.path, 0o600)
        except OSError as exc:
            if temp_name:
                try:
                    os.unlink(temp_name)
                except OSError:
                    pass
            raise AuthStateError("No se pudo guardar el estado de autenticación local.") from exc

    def issue_pairing_code(self, *, rotate: bool = False) -> str:
        """Create a user-initiated, short-lived code; never exposed by an API route."""
        with self._locked():
            state = self._read_unlocked()
            if state.get("token_hash") and not rotate:
                raise AlreadyPaired("La extensión ya está emparejada. Usa el comando explícito de rotación.")
            code = secrets.token_urlsafe(32)
            state = {
                "version": _STATE_VERSION,
                "token_hash": None,
                "extension_origin": None,
                "pairing": {
                    "code_hash": _digest(code),
                    "expires_at": int(self.clock()) + self.pairing_ttl_seconds,
                    "attempts": 0,
                },
            }
            self._write_unlocked(state)
            return code

    def revoke(self) -> None:
        """Revoke the active token and any pending pairing code."""
        with self._locked():
            self._write_unlocked({
                "version": _STATE_VERSION,
                "token_hash": None,
                "extension_origin": None,
                "pairing": None,
            })

    def pair(self, code: str, extension_origin: str) -> str:
        if not is_chrome_extension_origin(extension_origin):
            raise PairingUnavailable("No se pudo completar el emparejamiento.")
        with self._locked():
            state = self._read_unlocked()
            pairing = state.get("pairing")
            if state.get("token_hash") or not isinstance(pairing, dict):
                raise PairingUnavailable("No se pudo completar el emparejamiento.")
            now = int(self.clock())
            expires_at = pairing.get("expires_at")
            attempts = pairing.get("attempts")
            if now >= expires_at or attempts >= self.max_pairing_attempts:
                state["pairing"] = None
                self._write_unlocked(state)
                raise PairingUnavailable("No se pudo completar el emparejamiento.")
            supplied_hash = _digest(code if isinstance(code, str) else "")
            expected_hash = pairing.get("code_hash")
            if not isinstance(expected_hash, str) or not hmac.compare_digest(supplied_hash, expected_hash):
                attempts += 1
                state["pairing"] = None if attempts >= self.max_pairing_attempts else {**pairing, "attempts": attempts}
                self._write_unlocked(state)
                raise PairingUnavailable("No se pudo completar el emparejamiento.")

            token = secrets.token_urlsafe(32)
            state["token_hash"] = _digest(token)
            state["extension_origin"] = extension_origin
            state["pairing"] = None
            self._write_unlocked(state)
            return token

    def validate_token(self, token: str | None) -> bool:
        if not token or len(token) > 128:
            return False
        with self._locked():
            state = self._read_unlocked()
        expected_hash = state.get("token_hash")
        return isinstance(expected_hash, str) and hmac.compare_digest(_digest(token), expected_hash)

    def origin_matches(self, token: str, origin: str) -> bool:
        if not is_chrome_extension_origin(origin):
            return False
        with self._locked():
            state = self._read_unlocked()
        expected_hash = state.get("token_hash")
        return (
            isinstance(expected_hash, str)
            and hmac.compare_digest(_digest(token), expected_hash)
            and hmac.compare_digest(str(state.get("extension_origin") or ""), origin)
        )


def _error(status: int, code: str, message: str, *, authenticate: bool = False) -> JSONResponse:
    headers = {"WWW-Authenticate": "Bearer"} if authenticate else None
    return JSONResponse(
        status_code=status,
        content={"api_version": "1.0", "detail": message, "error": {"code": code, "message": message}},
        headers=headers,
    )


class LocalAuthMiddleware:
    """Fail-closed Host, bearer, and paired-extension-origin checks."""

    def __init__(self, app, auth: LocalAuthStore, port: int):
        self.app = app
        self.auth = auth
        self.expected_host = "127.0.0.1" if port == 80 else f"127.0.0.1:{port}"

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = scope.get("headers", [])
        hosts = [value.decode("latin-1").strip().lower() for key, value in headers if key.lower() == b"host"]
        if len(hosts) != 1 or hosts[0] != self.expected_host:
            response = _error(403, "host_forbidden", "El Host de la solicitud no está autorizado.")
            return await response(scope, receive, send)

        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()
        if method == "OPTIONS":
            return await self.app(scope, receive, send)
        if path == "/api/health":
            return await self.app(scope, receive, send)

        origin_values = [value.decode("latin-1") for key, value in headers if key.lower() == b"origin"]
        origin = origin_values[0] if len(origin_values) == 1 else None
        if path == "/api/auth/pair" and method == "POST":
            if len(origin_values) != 1 or not is_chrome_extension_origin(origin):
                response = _error(403, "origin_forbidden", "El origen de la extensión no está autorizado.")
                return await response(scope, receive, send)
            return await self.app(scope, receive, send)

        authorization_values = [value.decode("latin-1") for key, value in headers if key.lower() == b"authorization"]
        token = None
        if len(authorization_values) == 1:
            pieces = authorization_values[0].split()
            if len(pieces) == 2 and pieces[0].casefold() == "bearer":
                token = pieces[1]
        try:
            if not self.auth.validate_token(token):
                response = _error(401, "authentication_required", "Se requiere una credencial local válida.", authenticate=True)
                return await response(scope, receive, send)
            if origin_values and (
                len(origin_values) != 1 or not origin or not self.auth.origin_matches(token, origin)
            ):
                response = _error(403, "origin_forbidden", "El origen no coincide con la extensión emparejada.")
                return await response(scope, receive, send)
        except AuthStateError:
            response = _error(503, "auth_state_unavailable", "El estado de autenticación local no está disponible.")
            return await response(scope, receive, send)
        return await self.app(scope, receive, send)
