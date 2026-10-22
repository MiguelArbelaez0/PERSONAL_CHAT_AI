"""Bound request memory before parsing JSON; never log request contents."""
from fastapi.responses import JSONResponse


class RequestLimitsMiddleware:
    def __init__(self, app, max_bytes=262144):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = self.max_bytes + 1
        messages = []
        size = 0
        if declared <= self.max_bytes:
            while True:
                message = await receive()
                size += len(message.get("body", b""))
                if size > self.max_bytes:
                    break
                messages.append(message)
                if not message.get("more_body", False):
                    break
        if declared > self.max_bytes or size > self.max_bytes:
            response = JSONResponse(status_code=413, content={
                "api_version": "1.0", "detail": "La solicitud supera el límite de 256 KiB.",
                "error": {"code": "request_too_large", "message": "La solicitud supera el límite de 256 KiB."},
                "diagnostics": {"source": "backend", "stage": "request", "http_status": 413},
            })
            return await response(scope, receive, send)

        async def replay():
            return messages.pop(0) if messages else await receive()

        return await self.app(scope, replay, send)
