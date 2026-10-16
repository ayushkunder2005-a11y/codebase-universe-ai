import uuid
from pathlib import Path
from typing import List
from datetime import datetime
from fastapi import APIRouter, HTTPException

from app.models.chat import ChatRequest, ChatResponse, ChatMessage
from app.db.storage import storage
from app.ai.rag import codebase_rag

router = APIRouter(prefix="/api/projects/{project_id}", tags=["chat"])

@router.post("/chat", response_model=ChatResponse)
async def chat_with_assistant(project_id: str, req: ChatRequest):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    graph = await storage.get_graph(project_id)
    if not graph:
        raise HTTPException(status_code=400, detail="Repository not yet indexed. Please wait until indexing finishes.")

    conv_id = req.conversation_id or str(uuid.uuid4())
    repo_dir = Path(project.source_path).resolve()

    # Store user message
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        sender="user",
        content=req.message,
        timestamp=datetime.utcnow(),
        relevant_nodes=[req.focused_node_id] if req.focused_node_id else []
    )
    await storage.add_chat_message(project_id, conv_id, user_msg)

    # Generate grounded response
    response = await codebase_rag.answer_query(
        query=req.message,
        graph=graph,
        repo_dir=repo_dir,
        conversation_id=conv_id,
        focused_node_id=req.focused_node_id
    )

    # Store assistant message
    asst_msg = ChatMessage(
        id=str(uuid.uuid4()),
        sender="assistant",
        content=response.reply,
        timestamp=datetime.utcnow(),
        citations=response.citations,
        relevant_nodes=response.relevant_nodes
    )
    await storage.add_chat_message(project_id, conv_id, asst_msg)

    return response

@router.get("/conversations/{conversation_id}", response_model=List[ChatMessage])
async def get_conversation_history(project_id: str, conversation_id: str):
    return await storage.get_conversation(project_id, conversation_id)
