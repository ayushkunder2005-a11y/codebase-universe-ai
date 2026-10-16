from fastapi import APIRouter, HTTPException, Query

from app.models.analysis import AnalysisReport, ImpactAnalysisResult
from app.db.storage import storage
from app.graph.impact import impact_engine

router = APIRouter(prefix="/api/projects/{project_id}", tags=["analysis"])

@router.get("/analysis", response_model=AnalysisReport)
async def get_project_analysis(project_id: str):
    analysis = await storage.get_analysis(project_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis report not found. Has indexing completed?")
    return analysis

@router.get("/impact", response_model=ImpactAnalysisResult)
async def get_change_impact(project_id: str, target_node_id: str = Query(..., description="ID or path of node to analyze impact for")):
    graph = await storage.get_graph(project_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found.")

    impact = impact_engine.analyze_impact(graph, target_node_id)
    if not impact:
        raise HTTPException(status_code=404, detail=f"Target node '{target_node_id}' not found in project graph.")

    return impact
