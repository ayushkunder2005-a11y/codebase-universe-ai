from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class RefactorRequest(BaseModel):
    project_id: str
    file_path: str
    target_symbol: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    instruction: str
    run_tests: bool = False

class RefactorProposal(BaseModel):
    id: str
    project_id: str
    file_path: str
    title: str
    explanation: str
    original_code: str
    proposed_code: str
    unified_diff: str
    affected_tests: List[str] = Field(default_factory=list)
    test_validation_status: str = "not_run"  # "not_run" | "passed" | "failed" | "skipped"
    test_output: Optional[str] = None
    created_at: Optional[str] = None

class ApplyPatchRequest(BaseModel):
    proposal_id: str
    create_git_branch: bool = True
    branch_name: Optional[str] = None

class ApplyPatchResult(BaseModel):
    success: bool
    message: str
    applied_file: str
    git_branch: Optional[str] = None
    diff_applied: str
