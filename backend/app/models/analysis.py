from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class FindingSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class FindingCategory(str, Enum):
    CIRCULAR_DEPENDENCY = "circular_dependency"
    UNUSED_IMPORT = "unused_import"
    HIGH_COUPLING = "high_coupling"
    HIGH_COMPLEXITY = "high_complexity"
    GOD_COMPONENT = "god_component"
    ORPHAN_MODULE = "orphan_module"
    MISSING_DOCSTRING = "missing_docstring"

class AnalysisFinding(BaseModel):
    id: str
    category: FindingCategory
    severity: FindingSeverity
    title: str
    description: str
    file_path: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    affected_nodes: List[str] = Field(default_factory=list)
    recommendation: Optional[str] = None
    evidence_type: str = "static_analysis"  # Always distinguish static analysis from AI suggestions

class ComponentRisk(BaseModel):
    node_id: str
    name: str
    file_path: str
    risk_score: float  # 0.0 to 100.0
    factors: List[str] = Field(default_factory=list)
    blast_radius_size: int = 0
    complexity: int = 1
    coupling: float = 0.0

class ImpactAnalysisResult(BaseModel):
    target_node_id: str
    target_name: str
    target_type: str
    file_path: Optional[str] = None
    direct_dependencies: List[Dict[str, Any]] = Field(default_factory=list)
    direct_dependents: List[Dict[str, Any]] = Field(default_factory=list)
    total_blast_radius: List[Dict[str, Any]] = Field(default_factory=list)
    related_tests: List[str] = Field(default_factory=list)
    suggested_test_commands: List[str] = Field(default_factory=list)
    risk_assessment: str
    potential_impact_summary: str

class AnalysisReport(BaseModel):
    project_id: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    overall_health_score: float = 100.0
    findings: List[AnalysisFinding] = Field(default_factory=list)
    circular_dependencies: List[List[str]] = Field(default_factory=list)
    top_risks: List[ComponentRisk] = Field(default_factory=list)
    summary: Dict[str, Any] = Field(default_factory=dict)
