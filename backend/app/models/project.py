from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class ProjectStatus(str, Enum):
    INITIALIZED = "initialized"
    INDEXING = "indexing"
    PARSING = "parsing"
    GRAPH_BUILDING = "graph_building"
    ANALYZING = "analyzing"
    READY = "ready"
    FAILED = "failed"

class ProjectSourceType(str, Enum):
    LOCAL_FOLDER = "local_folder"
    ZIP_ARCHIVE = "zip_archive"
    GIT_REPO = "git_repo"
    SAMPLE = "sample"

class ProjectStats(BaseModel):
    total_files: int = 0
    total_directories: int = 0
    total_lines_of_code: int = 0
    total_functions: int = 0
    total_classes: int = 0
    total_modules: int = 0
    languages: Dict[str, int] = Field(default_factory=dict)
    average_complexity: float = 0.0

class Project(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    source_type: ProjectSourceType
    source_path: str
    status: ProjectStatus = ProjectStatus.INITIALIZED
    status_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    stats: ProjectStats = Field(default_factory=ProjectStats)
    excluded_patterns: List[str] = Field(default_factory=lambda: [
        ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
        ".env", "*.pyc", ".pytest_cache", ".idea", ".vscode"
    ])

class ProjectCreate(BaseModel):
    name: str
    source_type: ProjectSourceType
    local_path: Optional[str] = None
    git_url: Optional[str] = None
