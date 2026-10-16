from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class NodeType(str, Enum):
    DIRECTORY = "directory"
    FILE = "file"
    MODULE = "module"
    CLASS = "class"
    FUNCTION = "function"

class EdgeType(str, Enum):
    CONTAINS = "contains"
    IMPORTS = "imports"
    CALLS = "calls"
    INHERITS_FROM = "inherits_from"
    DEPENDS_ON = "depends_on"

class NodeMetrics(BaseModel):
    loc: int = 0
    complexity: int = 1
    in_degree: int = 0
    out_degree: int = 0
    coupling_score: float = 0.0
    risk_score: float = 0.0

class Position3D(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

class GraphNode(BaseModel):
    id: str
    name: str
    type: NodeType
    file_path: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    language: Optional[str] = None
    parent_id: Optional[str] = None
    metrics: NodeMetrics = Field(default_factory=NodeMetrics)
    position: Position3D = Field(default_factory=Position3D)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: EdgeType
    weight: float = 1.0
    line_number: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class CodeGraph(BaseModel):
    project_id: str
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)

class GraphFilter(BaseModel):
    node_types: Optional[List[NodeType]] = None
    edge_types: Optional[List[EdgeType]] = None
    languages: Optional[List[str]] = None
    directory: Optional[str] = None
    search_query: Optional[str] = None
    max_nodes: Optional[int] = 1000
