from app.ai.provider import OllamaProvider
from app.config import settings

def test_ollama_status_endpoint(client):
    resp = client.get("/api/ollama/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "connected" in data
    assert "provider" in data
    assert "active_model" in data

def test_ollama_model_selection(client):
    resp = client.post("/api/ollama/model", json={"model": "llama3.2:1b"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["active_model"] == "llama3.2:1b"
    assert data["provider"] == "ollama"

def test_ollama_provider_available_models():
    provider = OllamaProvider(settings.OLLAMA_BASE_URL, "llama3.2:1b")
    assert provider.base_url.startswith("http")
