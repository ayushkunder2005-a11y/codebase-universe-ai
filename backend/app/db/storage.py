import json
import asyncio
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from app.config import settings
from app.db.mongo import mongo_db
from app.models.project import Project, ProjectStatus, ProjectStats
from app.models.graph import CodeGraph
from app.models.analysis import AnalysisReport
from app.models.chat import ChatMessage
from app.models.refactor import RefactorProposal

logger = logging.getLogger(__name__)

class StorageManager:
    """
    Unified Storage Layer for Codebase Universe AI.
    Seamlessly uses MongoDB when available, or an embedded asynchronous JSON-backed
    document storage engine when running standalone without an external MongoDB server.
    """
    def __init__(self):
        self.local_db_file = settings.DATA_DIR / "codebase_universe_db.json"
        self._lock = asyncio.Lock()
        self._memory_cache: Dict[str, Dict[str, Any]] = {
            "projects": {},
            "graphs": {},
            "analyses": {},
            "proposals": {},
            "conversations": {}
        }
        self._load_local_db()

    def _load_local_db(self):
        """Loads local JSON store if it exists."""
        if self.local_db_file.exists():
            try:
                with open(self.local_db_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for key in self._memory_cache.keys():
                        self._memory_cache[key] = data.get(key, {})
            except Exception as e:
                logger.error("Failed to load local DB: %s", e)

    def _write_to_disk_sync(self, data: dict):
        """Synchronous file writer executed in thread pool."""
        try:
            temp_file = self.local_db_file.with_suffix(".tmp")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, default=str, separators=(",", ":"))
            temp_file.replace(self.local_db_file)
        except Exception as e:
            logger.error("Failed to persist local DB: %s", e)

    async def _persist_local_db(self):
        """Persists memory store to local file safely in background thread without blocking event loop."""
        try:
            snapshot = {k: dict(v) for k, v in self._memory_cache.items()}
            await asyncio.to_thread(self._write_to_disk_sync, snapshot)
        except Exception as e:
            logger.error("Failed to persist local DB: %s", e)

    # ----------------- Projects -----------------
    async def save_project(self, project: Project) -> Project:
        project_dict = project.model_dump()
        project_dict["_id"] = project.id
        now_str = datetime.now(timezone.utc).isoformat()
        project_dict["updated_at"] = now_str
        if isinstance(project_dict.get("created_at"), datetime):
            project_dict["created_at"] = project_dict["created_at"].isoformat()

        if mongo_db.is_connected:
            db = mongo_db.get_db()
            await db.projects.replace_one({"_id": project.id}, project_dict, upsert=True)
        else:
            async with self._lock:
                self._memory_cache["projects"][project.id] = project_dict
                await self._persist_local_db()
        return project

    async def get_project(self, project_id: str) -> Optional[Project]:
        if mongo_db.is_connected:
            db = mongo_db.get_db()
            doc = await db.projects.find_one({"_id": project_id})
            if doc:
                doc.pop("_id", None)
                return Project(**doc)
            return None
        else:
            async with self._lock:
                doc = self._memory_cache["projects"].get(project_id)
                if doc:
                    doc_copy = dict(doc)
                    doc_copy.pop("_id", None)
                    return Project(**doc_copy)
                return None

    async def list_projects(self) -> List[Project]:
        projects = []
        if mongo_db.is_connected:
            db = mongo_db.get_db()
            cursor = db.projects.find().sort("updated_at", -1)
            async for doc in cursor:
                doc.pop("_id", None)
                projects.append(Project(**doc))
        else:
            async with self._lock:
                for doc in self._memory_cache["projects"].values():
                    doc_copy = dict(doc)
                    doc_copy.pop("_id", None)
                    projects.append(Project(**doc_copy))
                projects.sort(key=lambda p: str(p.updated_at), reverse=True)
        return projects

    async def delete_project(self, project_id: str) -> bool:
        if mongo_db.is_connected:
            db = mongo_db.get_db()
            await db.projects.delete_one({"_id": project_id})
            await db.graphs.delete_one({"_id": project_id})
            await db.analyses.delete_one({"_id": project_id})
            await db.conversations.delete_many({"project_id": project_id})
        else:
            async with self._lock:
                self._memory_cache["projects"].pop(project_id, None)
                self._memory_cache["graphs"].pop(project_id, None)
                self._memory_cache["analyses"].pop(project_id, None)
                self._memory_cache["conversations"].pop(project_id, None)
                await self._persist_local_db()
        return True

    async def update_project_status(self, project_id: str, status: ProjectStatus, message: Optional[str] = None):
        project = await self.get_project(project_id)
        if project:
            project.status = status
            project.status_message = message
            project.updated_at = datetime.now(timezone.utc)
            await self.save_project(project)

    async def update_project_stats(self, project_id: str, stats: ProjectStats):
        project = await self.get_project(project_id)
        if project:
            project.stats = stats
            project.updated_at = datetime.now(timezone.utc)
            await self.save_project(project)

    # ----------------- Graphs -----------------
    async def save_graph(self, graph: CodeGraph):
        graph_dict = graph.model_dump()
        graph_dict["_id"] = graph.project_id

        if mongo_db.is_connected:
            db = mongo_db.get_db()
            await db.graphs.replace_one({"_id": graph.project_id}, graph_dict, upsert=True)
        else:
            async with self._lock:
                self._memory_cache["graphs"][graph.project_id] = graph_dict
                await self._persist_local_db()

    async def get_graph(self, project_id: str) -> Optional[CodeGraph]:
        if mongo_db.is_connected:
            db = mongo_db.get_db()
            doc = await db.graphs.find_one({"_id": project_id})
            if doc:
                doc.pop("_id", None)
                return CodeGraph(**doc)
            return None
        else:
            async with self._lock:
                doc = self._memory_cache["graphs"].get(project_id)
                if doc:
                    doc_copy = dict(doc)
                    doc_copy.pop("_id", None)
                    return CodeGraph(**doc_copy)
                return None

    # ----------------- Analyses -----------------
    async def save_analysis(self, analysis: AnalysisReport):
        analysis_dict = analysis.model_dump()
        analysis_dict["_id"] = analysis.project_id

        if mongo_db.is_connected:
            db = mongo_db.get_db()
            await db.analyses.replace_one({"_id": analysis.project_id}, analysis_dict, upsert=True)
        else:
            async with self._lock:
                self._memory_cache["analyses"][analysis.project_id] = analysis_dict
                await self._persist_local_db()

    async def get_analysis(self, project_id: str) -> Optional[AnalysisReport]:
        if mongo_db.is_connected:
            db = mongo_db.get_db()
            doc = await db.analyses.find_one({"_id": project_id})
            if doc:
                doc.pop("_id", None)
                return AnalysisReport(**doc)
            return None
        else:
            async with self._lock:
                doc = self._memory_cache["analyses"].get(project_id)
                if doc:
                    doc_copy = dict(doc)
                    doc_copy.pop("_id", None)
                    return AnalysisReport(**doc_copy)
                return None

    # ----------------- Refactoring Proposals -----------------
    async def save_proposal(self, proposal: RefactorProposal):
        proposal_dict = proposal.model_dump()
        proposal_dict["_id"] = proposal.id

        if mongo_db.is_connected:
            db = mongo_db.get_db()
            await db.proposals.replace_one({"_id": proposal.id}, proposal_dict, upsert=True)
        else:
            async with self._lock:
                self._memory_cache["proposals"][proposal.id] = proposal_dict
                await self._persist_local_db()

    async def get_proposal(self, proposal_id: str) -> Optional[RefactorProposal]:
        if mongo_db.is_connected:
            db = mongo_db.get_db()
            doc = await db.proposals.find_one({"_id": proposal_id})
            if doc:
                doc.pop("_id", None)
                return RefactorProposal(**doc)
            return None
        else:
            async with self._lock:
                doc = self._memory_cache["proposals"].get(proposal_id)
                if doc:
                    doc_copy = dict(doc)
                    doc_copy.pop("_id", None)
                    return RefactorProposal(**doc_copy)
                return None

    # ----------------- Chat Conversations -----------------
    async def add_chat_message(self, project_id: str, conversation_id: str, message: ChatMessage):
        msg_dict = message.model_dump()
        if isinstance(msg_dict.get("timestamp"), datetime):
            msg_dict["timestamp"] = msg_dict["timestamp"].isoformat()

        if mongo_db.is_connected:
            db = mongo_db.get_db()
            await db.conversations.insert_one({
                "project_id": project_id,
                "conversation_id": conversation_id,
                "message": msg_dict
            })
        else:
            async with self._lock:
                if project_id not in self._memory_cache["conversations"]:
                    self._memory_cache["conversations"][project_id] = {}
                if conversation_id not in self._memory_cache["conversations"][project_id]:
                    self._memory_cache["conversations"][project_id][conversation_id] = []
                self._memory_cache["conversations"][project_id][conversation_id].append(msg_dict)
                await self._persist_local_db()

    async def get_conversation(self, project_id: str, conversation_id: str) -> List[ChatMessage]:
        messages = []
        if mongo_db.is_connected:
            db = mongo_db.get_db()
            cursor = db.conversations.find({"project_id": project_id, "conversation_id": conversation_id}).sort("message.timestamp", 1)
            async for doc in cursor:
                messages.append(ChatMessage(**doc["message"]))
        else:
            async with self._lock:
                convs = self._memory_cache["conversations"].get(project_id, {}).get(conversation_id, [])
                for msg in convs:
                    messages.append(ChatMessage(**msg))
        return messages

storage = StorageManager()
