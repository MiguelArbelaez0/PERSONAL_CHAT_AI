import httpx
import pytest

from backend.lm_studio import LMStudioClient, LMStudioError, _model_inventory


def test_inventory_separates_embeddings_from_chat_and_uses_api_metadata():
    models = _model_inventory({"models": [
        {"key": "text-embed", "display_name": "Embedding local", "type": "embedding", "loaded_instances": []},
        {"key": "qwen-chat", "display_name": "Qwen conversación", "type": "llm",
         "loaded_instances": [{"id": "instance-1", "config": {"context_length": 8192}}],
         "max_context_length": 32768, "quantization": {"name": "Q4_K_M"}, "size_bytes": 4_000_000},
        {"key": "unknown", "type": "future-model-kind"},
    ]})

    assert [model.id for model in models if model.model_type == "llm"] == ["qwen-chat"]
    chat = next(model for model in models if model.id == "qwen-chat")
    assert chat.name == "Qwen conversación"
    assert chat.loaded is True
    assert chat.max_context_length == 32768
    assert chat.quantization == "Q4_K_M"
    assert chat.size_bytes == 4_000_000
    assert next(model for model in models if model.id == "text-embed").model_type == "embedding"


def test_legacy_typed_inventory_keeps_unloaded_state_and_never_guesses_type():
    models = _model_inventory({"data": [
        {"id": "embed-first", "type": "embeddings", "state": "not-loaded"},
        {"id": "chat-second", "type": "llm", "state": "not-loaded", "max_context_length": 4096},
        {"id": "ambiguous", "state": "loaded"},
    ]})
    assert [(item.id, item.loaded) for item in models if item.model_type == "llm"] == [("chat-second", False)]
    assert next(item for item in models if item.id == "ambiguous").model_type == "unknown"


def test_empty_inventory_has_no_auto_selected_chat_model(monkeypatch):
    class FakeResponse:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {"models": []}

    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, url):
            assert url.endswith("/api/v1/models")
            return FakeResponse()

    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", lambda **kwargs: FakeClient())
    async def run():
        assert await LMStudioClient("http://127.0.0.1:1234/v1").models() == []
    asyncio_run(run())


def test_embedding_first_does_not_prevent_selecting_the_typed_chat_model(monkeypatch):
    class FakeResponse:
        status_code = 200
        def raise_for_status(self): pass
        def json(self):
            return {"models": [
                {"key": "embed-first", "type": "embedding"},
                {"key": "chat-second", "type": "llm", "loaded_instances": []},
            ]}

    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, url): return FakeResponse()

    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", lambda **kwargs: FakeClient())
    async def run():
        assert await LMStudioClient("http://127.0.0.1:1234/v1").models() == ["chat-second"]
    asyncio_run(run())


def test_missing_model_selection_fails_instead_of_using_first_model(monkeypatch):
    class MustNotConnect:
        def __init__(self, **kwargs): raise AssertionError("no implicit model discovery/generation")

    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", MustNotConnect)
    async def run():
        with pytest.raises(LMStudioError) as error:
            await LMStudioClient("http://127.0.0.1:1234/v1", model="").chat([], 1)
        assert error.value.reason_code == "model_selection_required"
    asyncio_run(run())


def test_inventory_falls_back_to_typed_v0_only_when_v1_endpoint_is_missing(monkeypatch):
    requested = []
    class FakeResponse:
        def __init__(self, status, body): self.status_code, self.body = status, body
        def raise_for_status(self):
            if self.status_code >= 400:
                request = httpx.Request("GET", "http://127.0.0.1:1234/api/v0/models")
                raise httpx.HTTPStatusError("missing", request=request, response=httpx.Response(self.status_code, request=request))
        def json(self): return self.body
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, url):
            requested.append(url)
            if url.endswith("/api/v1/models"):
                return FakeResponse(404, {})
            return FakeResponse(200, {"data": [{"id": "chat", "type": "llm"}, {"id": "embed", "type": "embeddings"}]})

    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", lambda **kwargs: FakeClient())
    async def run():
        assert await LMStudioClient("http://127.0.0.1:1234/v1").models() == ["chat"]
    asyncio_run(run())
    assert requested == ["http://127.0.0.1:1234/api/v1/models", "http://127.0.0.1:1234/api/v0/models"]


def test_disconnected_and_timeout_model_discovery_are_recoverable(monkeypatch):
    class BrokenClient:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, url): raise httpx.ConnectError("synthetic offline")
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", BrokenClient)
    async def run_offline():
        with pytest.raises(LMStudioError) as error:
            await LMStudioClient("http://127.0.0.1:1234/v1").models()
        assert error.value.reason_code == "unavailable"
    asyncio_run(run_offline())

    class SlowClient(BrokenClient):
        async def get(self, url): raise httpx.TimeoutException("synthetic timeout")
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", SlowClient)
    async def run_timeout():
        with pytest.raises(LMStudioError) as error:
            await LMStudioClient("http://127.0.0.1:1234/v1").models()
        assert error.value.reason_code == "timeout"
    asyncio_run(run_timeout())


def test_auth_required_model_catalog_and_removed_selected_model_have_clear_recoverable_errors(monkeypatch):
    class UnauthorizedClient:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def get(self, url):
            request = httpx.Request("GET", url)
            return httpx.Response(401, request=request, text="synthetic private detail")
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", UnauthorizedClient)
    async def run_unauthorized():
        with pytest.raises(LMStudioError) as error:
            await LMStudioClient("http://127.0.0.1:1234/v1").models()
        assert error.value.reason_code == "unauthorized"
        assert "synthetic private detail" not in str(error.value)
    asyncio_run(run_unauthorized())

    class MissingModelClient:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, url, **kwargs):
            request = httpx.Request("POST", url)
            return httpx.Response(404, request=request, text="synthetic missing model detail")
    monkeypatch.setattr("backend.lm_studio.httpx.AsyncClient", MissingModelClient)
    async def run_missing():
        with pytest.raises(LMStudioError) as error:
            await LMStudioClient("http://127.0.0.1:1234/v1", model="removed-model").chat([], 1)
        assert error.value.reason_code == "selected_model_missing"
        assert "synthetic missing model detail" not in str(error.value)
    asyncio_run(run_missing())


def asyncio_run(coroutine):
    import asyncio
    return asyncio.run(coroutine)
