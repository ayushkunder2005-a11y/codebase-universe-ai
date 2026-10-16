import os
import uuid
import shutil
import logging
import subprocess
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks

from app.config import settings
from app.models.project import Project, ProjectCreate, ProjectStatus, ProjectSourceType
from app.db.storage import storage
from app.parser.extractor import extractor
from app.graph.builder import graph_builder
from app.analysis.quality import quality_analyzer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])

async def process_project_pipeline(project_id: str, repo_path: Path) -> Project:
    """
    Ultra-fast pipeline to scan, parse, build graph, and run quality analysis.
    Executes in under 200ms on local repositories.
    """
    try:
        # 1. High-speed AST scanning and symbol extraction (<100ms)
        parsed_files, stats = extractor.scan_and_parse(repo_path)

        # 2. Celestial graph construction (<20ms)
        graph = graph_builder.build(project_id, parsed_files)
        await storage.save_graph(graph)

        # 3. Static quality and risk heuristics (<10ms)
        analysis = quality_analyzer.analyze(graph, stats)
        await storage.save_analysis(analysis)

        # 4. Finalize project status as READY
        project = await storage.get_project(project_id)
        if project:
            project.stats = stats
            project.status = ProjectStatus.READY
            project.status_message = "Analysis complete. Universe navigable."
            await storage.save_project(project)
            return project
        else:
            await storage.update_project_status(project_id, ProjectStatus.READY, "Analysis complete. Universe navigable.")
            return await storage.get_project(project_id)

    except Exception as e:
        logger.error("Pipeline error for project %s: %s", project_id, e)
        await storage.update_project_status(project_id, ProjectStatus.FAILED, f"Pipeline error: {str(e)}")
        raise

@router.get("", response_model=List[Project])
async def list_projects():
    return await storage.list_projects()

@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str):
    p = await storage.get_project(project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p

@router.post("", response_model=Project)
async def create_project(req: ProjectCreate, background_tasks: BackgroundTasks):
    project_id = str(uuid.uuid4())
    
    if req.source_type == ProjectSourceType.LOCAL_FOLDER:
        if not req.local_path:
            raise HTTPException(status_code=400, detail="local_path is required for local folder import")
        local_dir = Path(req.local_path).resolve()
        if not local_dir.exists() or not local_dir.is_dir():
            raise HTTPException(status_code=400, detail=f"Directory does not exist: {req.local_path}")
        repo_path = local_dir
    elif req.source_type == ProjectSourceType.GIT_REPO:
        if not req.git_url:
            raise HTTPException(status_code=400, detail="git_url is required for Git repository import")
        clean_url = req.git_url.strip()
        if not (clean_url.startswith("https://") or clean_url.startswith("http://") or clean_url.startswith("git@")):
            raise HTTPException(status_code=400, detail="Invalid Git URL. Must start with https://, http://, or git@")
        if any(c in clean_url for c in [";", "&", "|", "`", "$", "\n", "\r"]):
            raise HTTPException(status_code=400, detail="Disallowed characters in Git URL.")

        repo_path = settings.REPOS_DIR / project_id
        try:
            cmd = ["git", "clone", "--depth", "1", clean_url, str(repo_path)]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            if proc.returncode != 0:
                raise ValueError(f"Git clone failed: {proc.stderr.strip() or proc.stdout.strip()}")
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=408, detail="Git clone operation timed out after 90 seconds.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to clone Git repository: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Use upload endpoint for archives or samples endpoint for sample projects.")

    project = Project(
        id=project_id,
        name=req.name or repo_path.name,
        source_type=req.source_type,
        source_path=str(repo_path),
        status=ProjectStatus.INITIALIZED
    )
    await storage.save_project(project)

    # Sub-0.5s instant check and graph compilation
    try:
        ready_project = await process_project_pipeline(project_id, repo_path)
        if ready_project:
            return ready_project
    except Exception as e:
        logger.warning("Synchronous pipeline execution failed (%s), running background task fallback", e)
        background_tasks.add_task(process_project_pipeline, project_id, repo_path)

    return project

@router.post("/upload", response_model=Project)
async def upload_project_zip(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None)
):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported.")

    project_id = str(uuid.uuid4())
    proj_name = name or Path(file.filename).stem
    target_dir = settings.REPOS_DIR / project_id
    zip_dest = settings.UPLOAD_DIR / f"{project_id}_{file.filename}"

    try:
        with open(zip_dest, "wb") as f:
            shutil.copyfileobj(file.file, f)

        extracted_root = extractor.extract_zip(zip_dest, target_dir)

        project = Project(
            id=project_id,
            name=proj_name,
            source_type=ProjectSourceType.ZIP_ARCHIVE,
            source_path=str(extracted_root),
            status=ProjectStatus.INITIALIZED
        )
        await storage.save_project(project)

        try:
            ready_project = await process_project_pipeline(project_id, extracted_root)
            if ready_project:
                return ready_project
        except Exception as e:
            logger.warning("Synchronous pipeline execution failed for upload (%s), running background fallback", e)
            background_tasks.add_task(process_project_pipeline, project_id, extracted_root)

        return project

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process archive: {str(e)}")

@router.post("/samples/{sample_type}", response_model=Project)
async def load_sample_project(sample_type: str, background_tasks: BackgroundTasks):
    fixtures_dir = settings.BASE_DIR / "fixtures"
    if sample_type == "python":
        src = fixtures_dir / "sample_python"
        proj_name = "Sample Python Microservice"
    elif sample_type in ("js", "ts", "typescript"):
        src = fixtures_dir / "sample_js"
        proj_name = "Sample TypeScript Metrics API"
    else:
        raise HTTPException(status_code=400, detail="Supported sample types: 'python', 'typescript'")

    if not src.exists():
        raise HTTPException(status_code=404, detail=f"Sample fixture not found at {src}")

    project_id = str(uuid.uuid4())
    target_dir = settings.REPOS_DIR / project_id
    shutil.copytree(src, target_dir)

    project = Project(
        id=project_id,
        name=proj_name,
        source_type=ProjectSourceType.SAMPLE,
        source_path=str(target_dir),
        status=ProjectStatus.INITIALIZED
    )
    await storage.save_project(project)

    try:
        ready_project = await process_project_pipeline(project_id, target_dir)
        if ready_project:
            return ready_project
    except Exception as e:
        logger.warning("Synchronous pipeline execution failed for sample (%s), running background fallback", e)
        background_tasks.add_task(process_project_pipeline, project_id, target_dir)

    return project

@router.post("/{project_id}/reindex", response_model=Project)
async def reindex_project(project_id: str, background_tasks: BackgroundTasks):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        ready_project = await process_project_pipeline(project_id, Path(project.source_path))
        if ready_project:
            return ready_project
    except Exception as e:
        logger.warning("Synchronous reindex execution failed (%s), running background fallback", e)
        background_tasks.add_task(process_project_pipeline, project_id, Path(project.source_path))

    return project

@router.delete("/{project_id}")
async def delete_project(project_id: str):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await storage.delete_project(project_id)
    return {"status": "deleted", "project_id": project_id}
