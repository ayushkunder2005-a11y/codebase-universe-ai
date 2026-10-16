import os
import zipfile
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import logging

from app.config import settings
from app.parser.base import ParsedFile
from app.parser.python_parser import PythonParser
from app.parser.js_ts_parser import JsTsParser
from app.models.project import ProjectStats

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
}

DEFAULT_IGNORED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".pytest_cache", ".idea", ".vscode", "coverage", ".next", ".nuxt", "target"
}

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".pdf", ".zip", ".tar",
    ".gz", ".exe", ".bin", ".pyc", ".pyd", ".dll", ".so", ".dylib", ".woff",
    ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".db", ".sqlite", ".sqlite3"
}

class RepositoryExtractor:
    def __init__(self):
        self.py_parser = PythonParser()
        self.js_ts_parser = JsTsParser()

    def extract_zip(self, zip_path: Path, target_dir: Path) -> Path:
        """
        Safely unpacks a ZIP archive while strictly preventing ZipSlip path traversal attacks.
        """
        target_dir.mkdir(parents=True, exist_ok=True)
        target_resolved = target_dir.resolve()

        with zipfile.ZipFile(zip_path, 'r') as zf:
            for member in zf.infolist():
                # Normalize filename to remove leading slashes and drive letters
                member_path = Path(member.filename)
                destination = (target_dir / member_path).resolve()

                # Security check: ensure target stays inside target_dir
                if not destination.is_relative_to(target_resolved):
                    raise ValueError(f"Security Alert: Malicious archive member path traversal attempt: {member.filename}")

                zf.extract(member, target_dir)

        # If zip contains a single root directory, return that inner directory
        items = [p for p in target_dir.iterdir() if not p.name.startswith(".")]
        if len(items) == 1 and items[0].is_dir():
            return items[0]

        return target_dir

    def scan_and_parse(self, repo_dir: Path, custom_ignores: Optional[List[str]] = None) -> Tuple[List[ParsedFile], ProjectStats]:
        """
        Scans repository, parses all supported files, and computes project statistics.
        """
        parsed_files: List[ParsedFile] = []
        ignored_names = DEFAULT_IGNORED_DIRS.copy()
        if custom_ignores:
            ignored_names.update(custom_ignores)

        total_files = 0
        total_loc = 0
        total_functions = 0
        total_classes = 0
        language_counts: Dict[str, int] = {}
        all_complexities: List[int] = []
        directories_seen = set()

        for root, dirs, files in os.walk(repo_dir):
            # In-place directory filtering
            dirs[:] = [d for d in dirs if d not in ignored_names and not d.startswith(".")]
            rel_root = os.path.relpath(root, repo_dir)
            if rel_root != ".":
                directories_seen.add(rel_root)

            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in BINARY_EXTENSIONS or file.startswith("."):
                    continue

                file_path = Path(root) / file
                rel_path = os.path.relpath(file_path, repo_dir).replace("\\", "/")

                if ext in SUPPORTED_EXTENSIONS:
                    lang = SUPPORTED_EXTENSIONS[ext]
                    language_counts[lang] = language_counts.get(lang, 0) + 1
                    total_files += 1

                    try:
                        # Skip oversized files
                        if file_path.stat().st_size > settings.MAX_FILE_SIZE_BYTES:
                            logger.warning("Skipping oversized file: %s", rel_path)
                            continue

                        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                            content = f.read()

                        if lang == "python":
                            pf = self.py_parser.parse_code(content, str(file_path), rel_path)
                        else:
                            pf = self.js_ts_parser.parse_code(content, str(file_path), rel_path)

                        parsed_files.append(pf)
                        total_loc += pf.loc

                        for sym in pf.symbols:
                            if sym.kind in ("function", "async_function", "method"):
                                total_functions += 1
                                all_complexities.append(sym.complexity)
                            elif sym.kind == "class":
                                total_classes += 1

                    except Exception as e:
                        logger.error("Failed to parse %s: %s", rel_path, e)

        avg_complexity = (sum(all_complexities) / len(all_complexities)) if all_complexities else 1.0

        stats = ProjectStats(
            total_files=total_files,
            total_directories=len(directories_seen),
            total_lines_of_code=total_loc,
            total_functions=total_functions,
            total_classes=total_classes,
            total_modules=total_files,
            languages=language_counts,
            average_complexity=round(avg_complexity, 2)
        )

        return parsed_files, stats

extractor = RepositoryExtractor()
