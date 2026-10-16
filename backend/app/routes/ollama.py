import httpx
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api/ollama", tags=["ollama"])

class ModelSelectRequest(BaseModel):
    model: str

class PullModelRequest(BaseModel):
    model: str

@router.get("/status")
async def get_ollama_status():
    """
    Checks if Ollama is running and returns the list of installed models and active model.
    """
    base_url = settings.OLLAMA_BASE_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(f"{base_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                
                # If active model not in list but list has models, auto-select first
                active = settings.OLLAMA_MODEL
                if models and active not in models:
                    active = models[0]
                    settings.OLLAMA_MODEL = active

                return {
                    "connected": True,
                    "provider": settings.LLM_PROVIDER,
                    "base_url": base_url,
                    "active_model": active,
                    "models": models
                }
    except Exception as e:
        return {
            "connected": False,
            "provider": settings.LLM_PROVIDER,
            "base_url": base_url,
            "active_model": settings.OLLAMA_MODEL,
            "models": [],
            "error": str(e)
        }

@router.post("/model")
async def select_ollama_model(req: ModelSelectRequest):
    settings.OLLAMA_MODEL = req.model.strip()
    settings.LLM_PROVIDER = "ollama"
    return {
        "status": "updated",
        "active_model": settings.OLLAMA_MODEL,
        "provider": settings.LLM_PROVIDER
    }

async def pull_ollama_model_task(model_name: str):
    base_url = settings.OLLAMA_BASE_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            await client.post(f"{base_url}/api/pull", json={"name": model_name, "stream": False})
    except Exception as e:
        print(f"Error pulling model {model_name}: {e}")

@router.post("/pull")
async def pull_model(req: PullModelRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(pull_ollama_model_task, req.model.strip())
    return {
        "status": "pulling",
        "model": req.model.strip(),
        "message": f"Started pulling model '{req.model}'. It will appear in your models list shortly."
    }
