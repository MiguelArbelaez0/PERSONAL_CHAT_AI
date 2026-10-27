"""Explicit local console commands for pairing, rotation, and revocation."""

import argparse
import getpass
import sys

from backend.config import settings
from backend.security import AlreadyPaired, AuthStateError, LocalAuthStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Administración local de la autenticación de PERSONAL_CHAT_AI")
    parser.add_argument("action", choices=("pair", "rotate", "revoke"))
    args = parser.parse_args(argv)
    auth = LocalAuthStore(settings.auth_state_path)

    try:
        if args.action == "pair":
            code = auth.issue_pairing_code()
            print("Código de emparejamiento de un solo uso (válido durante 5 minutos):")
            print(code)
            print("Introduce el código solo en la página de conexión de PERSONAL_CHAT_AI; no lo pegues en Stripchat ni en DevTools.")
            return 0
        if args.action == "rotate":
            confirmation = getpass.getpass("Esto revocará el token actual. Escribe ROTAR para continuar: ")
            if confirmation != "ROTAR":
                print("Rotación cancelada.", file=sys.stderr)
                return 2
            code = auth.issue_pairing_code(rotate=True)
            print("Token anterior revocado. Código de emparejamiento de un solo uso (válido durante 5 minutos):")
            print(code)
            print("Introduce el código solo en la página de conexión de PERSONAL_CHAT_AI; no lo pegues en Stripchat ni en DevTools.")
            return 0
        confirmation = getpass.getpass("Esto revocará el token y los códigos pendientes. Escribe REVOCAR para continuar: ")
        if confirmation != "REVOCAR":
            print("Revocación cancelada.", file=sys.stderr)
            return 2
        auth.revoke()
        print("Credenciales locales revocadas.")
        return 0
    except AlreadyPaired as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except AuthStateError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
