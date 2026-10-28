"""Explicit local console commands for pairing, rotation, and revocation."""

import argparse
import getpass
import sys

from backend.config import settings
from backend.security import AlreadyPaired, AuthStateError, LocalAuthStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Administración local de la autenticación de PERSONAL_CHAT_AI")
    parser.add_argument("action", choices=("pair", "rotate", "revoke"))
    parser.add_argument("--native", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    auth = LocalAuthStore(settings.auth_state_path)

    try:
        if args.action == "pair":
            try:
                code = auth.issue_pairing_code()
            except AlreadyPaired:
                # The connection page's explicit user action is also the recovery
                # action when Chrome has lost its locally stored bearer.
                if not args.native:
                    raise
                code = auth.issue_pairing_code(rotate=True)
            if args.native:
                print(code)
                return 0
            print("Código de emparejamiento de un solo uso (válido durante 5 minutos):")
            print(code)
            print("Introduce el código solo en la página de conexión de PERSONAL_CHAT_AI; no lo pegues en Stripchat ni en DevTools.")
            return 0
        if args.action == "rotate":
            if not args.native:
                confirmation = getpass.getpass("Esto revocará el token actual. Escribe ROTAR para continuar: ")
                if confirmation != "ROTAR":
                    print("Rotación cancelada.", file=sys.stderr)
                    return 2
            code = auth.issue_pairing_code(rotate=True)
            if args.native:
                print(code)
                return 0
            print("Token anterior revocado. Código de emparejamiento de un solo uso (válido durante 5 minutos):")
            print(code)
            print("Introduce el código solo en la página de conexión de PERSONAL_CHAT_AI; no lo pegues en Stripchat ni en DevTools.")
            return 0
        if not args.native:
            confirmation = getpass.getpass("Esto revocará el token y los códigos pendientes. Escribe REVOCAR para continuar: ")
            if confirmation != "REVOCAR":
                print("Revocación cancelada.", file=sys.stderr)
                return 2
        auth.revoke()
        if args.native:
            print("ok")
            return 0
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
