"""Public pipeline diagnostics contain codes, never conversation contents."""
from fastapi import HTTPException


class PipelineFailure(HTTPException):
    def __init__(self, reason: str, stage: str, attempts: int, detail: str, status_code: int = 502,
                 duplicate_source: str | None = None, request_id: str | None = None, duration_ms: int | None = None):
        super().__init__(status_code, detail)
        self.reason, self.stage, self.attempts = reason, stage, attempts
        self.duplicate_source = duplicate_source
        self.request_id, self.duration_ms = request_id, duration_ms


def transport_failure(error, stage, attempts):
    reason = error.reason_code or ("http_error" if error.http_status else "unavailable")
    return PipelineFailure("lm_studio_" + reason, stage, attempts, str(error), 504 if reason == "timeout" else 503)
