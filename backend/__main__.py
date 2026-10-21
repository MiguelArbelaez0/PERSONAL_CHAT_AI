import uvicorn
from backend.config import settings

if __name__ == "__main__":
    # The memory API includes the interlocutor alias in its path; suppress access logs
    # so request URLs cannot disclose aliases in the terminal log.
    uvicorn.run("backend.main:app", host=settings.host, port=settings.port, reload=False, access_log=False)
