import os
import shutil
import uuid
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.mongo import mongo_db
from app.db.storage import storage
from app.routes.projects import router as projects_router, process_project_pipeline
from app.routes.graph import router as graph_router
from app.routes.analysis import router as analysis_router
from app.routes.chat import router as chat_router
from app.routes.refactor import router as refactor_router
from app.routes.files import router as files_router
from app.models.project import Project, ProjectStatus, ProjectSourceType

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Attempt MongoDB connection
    mongo_connected = await mongo_db.connect()
    
    # Auto-seed sample projects if empty
    existing_projects = await storage.list_projects()
    if not existing_projects:
        try:
            # Seed Python sample
            py_src = settings.BASE_DIR / "fixtures" / "sample_python"
            if py_src.exists():
                proj_id = "sample-python-microservice"
                dest = settings.REPOS_DIR / proj_id
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(py_src, dest)

                proj = Project(
                    id=proj_id,
                    name="Financial Microservice (Python)",
                    description="Sample Python project demonstrating circular imports, multi-branch complexity, and unit tests.",
                    source_type=ProjectSourceType.SAMPLE,
                    source_path=str(dest),
                    status=ProjectStatus.INITIALIZED
                )
                await storage.save_project(proj)
                await process_project_pipeline(proj_id, dest)

            # Seed TS sample
            ts_src = settings.BASE_DIR / "fixtures" / "sample_js"
            if ts_src.exists():
                proj_id = "sample-ts-metrics"
                dest = settings.REPOS_DIR / proj_id
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(ts_src, dest)

                proj = Project(
                    id=proj_id,
                    name="Telemetry Metrics API (TypeScript)",
                    description="Sample TypeScript project demonstrating interface abstractions, classes, and test suites.",
                    source_type=ProjectSourceType.SAMPLE,
                    source_path=str(dest),
                    status=ProjectStatus.INITIALIZED
                )
                await storage.save_project(proj)
                await process_project_pipeline(proj_id, dest)

        except Exception as e:
            print(f"Sample auto-seeding notice: {e}")

    yield

    # Shutdown
    await mongo_db.disconnect()

app = FastAPI(
    title=settings.APP_NAME,
    description="Interactive 3D Visual Code Intelligence & Architectural Universe",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(projects_router)
app.include_router(graph_router)
app.include_router(analysis_router)
app.include_router(chat_router)
app.include_router(refactor_router)
app.include_router(files_router)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "database": "mongodb" if mongo_db.is_connected else "embedded_local_store",
        "llm_provider": settings.LLM_PROVIDER,
        "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
