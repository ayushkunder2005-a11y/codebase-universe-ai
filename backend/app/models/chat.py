from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ChatCitation(BaseModel):
    file_path: str
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    snippet: Optional[str] = None
    entity_name: Optional[str] = None
    entity_type: Optional[str] = None
    verified: bool = True

class ChatMessage(BaseModel):
    id: str
    sender: str  # "user" | "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    citations: List[ChatCitation] = Field(default_factory=list)
    relevant_nodes: List[str] = Field(default_factory=list)

class ChatRequest(BaseModel):
    project_id: str
    message: str
    conversation_id: Optional[str] = None
    focused_node_id: Optional[str] = None

class ChatResponse(BaseModel):
    conversation_id: str
    reply: str
    citations: List[ChatCitation] = Field(default_factory=list)
    relevant_nodes: List[str] = Field(default_factory=list)
    evidence_status: str = "grounded"  # "grounded" | "hypothetical" | "insufficient_evidence"
    answer_source: str = "llm"  # "llm" | "static_fallback" | "error" - lets the UI label non-AI replies honestly
