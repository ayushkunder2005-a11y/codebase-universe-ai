from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from app.db.storage import storage

router = APIRouter(prefix="/api/projects/{project_id}/files", tags=["files"])

@router.get("/content")
async def get_file_content(project_id: str, path: str = Query(..., description="Relative file path")):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    repo_dir = Path(project.source_path).resolve()
    target_file = (repo_dir / path).resolve()

    # Security check: prevent path traversal outside repo root
    if not str(target_file).startswith(str(repo_dir)):
        raise HTTPException(status_code=403, detail="Access denied: path traversal detected.")

    if not target_file.exists() or not target_file.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    try:
        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        lines = content.splitlines()
        ext = target_file.suffix.lower()
        lang_map = {
            ".py": "python", ".js": "javascript", ".jsx": "javascript",
            ".ts": "typescript", ".tsx": "typescript", ".json": "json",
            ".md": "markdown", ".html": "html", ".css": "css"
        }

        return {
            "file_path": path,
            "language": lang_map.get(ext, "plaintext"),
            "total_lines": len(lines),
            "content": content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read file: {str(e)}")
