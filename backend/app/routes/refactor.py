from fastapi import APIRouter, HTTPException

from app.models.refactor import RefactorRequest, RefactorProposal, ApplyPatchRequest, ApplyPatchResult
from app.db.storage import storage
from app.ai.refactor import refactor_engine

router = APIRouter(prefix="/api/projects/{project_id}/refactor", tags=["refactor"])

@router.post("/propose", response_model=RefactorProposal)
async def propose_refactor(project_id: str, req: RefactorRequest):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        proposal = await refactor_engine.create_proposal(project, req)
        await storage.save_proposal(proposal)
        return proposal
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate refactoring proposal: {str(e)}")

@router.get("/proposals/{proposal_id}", response_model=RefactorProposal)
async def get_proposal(project_id: str, proposal_id: str):
    proposal = await storage.get_proposal(proposal_id)
    if not proposal or proposal.project_id != project_id:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal

@router.post("/apply", response_model=ApplyPatchResult)
async def apply_refactor_patch(project_id: str, req: ApplyPatchRequest):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    proposal = await storage.get_proposal(req.proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    try:
        result = refactor_engine.apply_proposal(
            project=project,
            proposal=proposal,
            create_branch=req.create_git_branch,
            branch_name=req.branch_name
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply patch: {str(e)}")
