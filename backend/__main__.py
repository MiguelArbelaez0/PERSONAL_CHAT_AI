import uvicorn
from backend.config import settings

if __name__ == "__main__":
    import sys

    if sys.argv[1:2] == ["--pcai-auth-admin"]:
        from backend.auth_admin import main as auth_admin_main

        raise SystemExit(auth_admin_main(sys.argv[2:]))

    # The memory API includes the interlocutor alias in its path; suppress access logs
    # so request URLs cannot disclose aliases in the terminal log.
    uvicorn.run("backend.main:app", host=settings.host, port=settings.port, reload=False, access_log=False)
