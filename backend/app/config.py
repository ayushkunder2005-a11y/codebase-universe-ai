import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Codebase Universe AI"
    APP_ENV: str = "development"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8008
    FRONTEND_PORT: int = 5173

    # Database
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "codebase_universe"
    
    # LLM Provider
    LLM_PROVIDER: str = "ollama"  # ollama, gemini, openai, mock
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2:1b"

    # Storage paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    STORAGE_DIR: Path = BASE_DIR / "storage"
    UPLOAD_DIR: Path = STORAGE_DIR / "uploads"
    REPOS_DIR: Path = STORAGE_DIR / "repos"
    DATA_DIR: Path = STORAGE_DIR / "data"

    # Security limits
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_FILES_PARSE_LIMIT: int = 2500
    MAX_FILE_SIZE_BYTES: int = 1024 * 1024 * 2  # 2MB per source file
    ENABLE_TEST_RUNNER: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

# Ensure required storage directories exist
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.REPOS_DIR.mkdir(parents=True, exist_ok=True)
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
