import logging

import httpx
from urllib.parse import urlsplit

logger = logging.getLogger(__name__)


class LMStudioError(RuntimeError):
    def __init__(self, message: str, http_status: int | None = None, reason_code: str | None = None):
        super().__init__(message)
        self.http_status = http_status
        self.reason_code = reason_code


def _content_text(content) -> tuple[str, str]:
    if isinstance(content, str):
        return content.strip(), "string"
    if isinstance(content, list):
        pieces = [item.get("text", "") for item in content if isinstance(item, dict) and isinstance(item.get("text"), str)]
        return "".join(pieces).strip(), "content_blocks"
    return "", "missing_or_unsupported"


class LMStudioClient:
    def __init__(self, base_url: str, model: str = "", timeout: float = 90, max_tokens: int = 500):
        self.base_url, self.model, self.timeout, self.max_tokens = base_url.rstrip("/"), model, timeout, max_tokens
        parsed = urlsplit(self.base_url)
        if parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed.username or parsed.password:
            raise ValueError("La URL de LM Studio debe ser HTTP local y no incluir credenciales.")

    async def models(self) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=min(self.timeout, 8)) as client:
                response = await client.get(f"{self.base_url}/models")
                response.raise_for_status()
                items = response.json().get("data", [])
                return [str(item["id"]) for item in items if isinstance(item, dict) and item.get("id")]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise LMStudioError("LM Studio no responde en la URL configurada.") from exc

    async def analyze(self, messages: list[dict]) -> list[str]:
        """Return the pre-generation analysis under the configured output cap."""
        return await self._chat(messages, 1, self.max_tokens, operation="analysis")

    async def chat(self, messages: list[dict], count: int) -> list[str]:
        return await self._chat(messages, count, self.max_tokens, operation="generation")

    async def translate(self, messages: list[dict]) -> list[str]:
        """Translate an already generated answer without creating another draft."""
        return await self._chat(messages, 1, self.max_tokens, temperature=0.2, operation="translation")

    async def review_translation(self, messages: list[dict]) -> list[str]:
        """Check semantic fidelity without changing either text."""
        return await self._chat(messages, 1, min(self.max_tokens, 500), temperature=0.0, operation="translation_review")

    async def _chat(self, messages: list[dict], count: int, max_tokens: int, temperature: float = 0.8, operation: str = "chat") -> list[str]:
        model = self.model
        if not model:
            available = await self.models()
            if not available:
                raise LMStudioError("LM Studio no tiene un modelo disponible; carga uno en la aplicación.")
            model = available[0]
        payload = {
            "model": model, "messages": messages, "temperature": temperature,
            "max_tokens": max_tokens, "n": count,
        }
        # LM Studio's Qwen3 model template enables a long reasoning block by
        # default; it can consume the output budget before the required JSON.
        if "qwen3" in model.casefold():
            payload["chat_template_kwargs"] = {"enable_thinking": False}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(f"{self.base_url}/chat/completions", json=payload)
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    logger.warning("lm_studio_response operation=%s http_status=%d format=http_error empty=false", operation, response.status_code)
                    raise LMStudioError(f"LM Studio devolvió HTTP {response.status_code}.", response.status_code) from exc
                data = response.json()
                choices = data.get("choices")
                if not isinstance(choices, list):
                    logger.warning("lm_studio_response operation=%s http_status=%d format=missing_choices empty=true", operation, response.status_code)
                    return []
                answers = []
                formats = set()
                finish_reasons = []
                for choice in choices:
                    if not isinstance(choice, dict):
                        continue
                    finish_reasons.append(choice.get("finish_reason", "unknown"))
                    message = choice.get("message")
                    content, content_format = _content_text(message.get("content") if isinstance(message, dict) else None)
                    formats.add(content_format)
                    if content:
                        answers.append(content)
                format_name = "+".join(sorted(formats)) or "no_choices"
                truncated = "length" in finish_reasons
                logger.info("lm_studio_response operation=%s http_status=%d format=%s empty=%s choices=%d truncated=%s", operation, response.status_code, format_name, not bool(answers), len(choices), truncated)
                if not answers:
                    return []
                if truncated:
                    logger.warning("lm_studio_response_incomplete operation=%s finish_reason=length", operation)
                    if operation in {"translation", "translation_review"}:
                        raise LMStudioError("LM Studio truncó la respuesta de traducción.", reason_code="truncated")
                    return []
                return answers[:count]
        except httpx.TimeoutException as exc:
            raise LMStudioError("LM Studio tardó demasiado en responder. Comprueba el modelo cargado.") from exc
        except httpx.ConnectError as exc:
            raise LMStudioError("No se pudo conectar con LM Studio. Inicia el servidor local en LM Studio.") from exc
        except httpx.HTTPStatusError as exc:
            raise LMStudioError(f"LM Studio devolvió HTTP {exc.response.status_code}.", exc.response.status_code) from exc
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
            raise LMStudioError("LM Studio devolvió una respuesta no válida.") from exc
