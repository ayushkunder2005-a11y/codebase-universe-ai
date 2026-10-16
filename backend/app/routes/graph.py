from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query

from app.models.graph import CodeGraph, GraphNode, NodeType, EdgeType
from app.db.storage import storage

router = APIRouter(prefix="/api/projects/{project_id}/graph", tags=["graph"])

@router.get("", response_model=CodeGraph)
async def get_graph(
    project_id: str,
    node_types: Optional[str] = Query(None, description="Comma-separated node types, e.g. file,class,function,directory"),
    languages: Optional[str] = Query(None, description="Comma-separated languages, e.g. python,typescript"),
    search: Optional[str] = Query(None, description="Filter nodes matching name or path"),
    max_nodes: int = Query(800, ge=10, le=3000)
):
    graph = await storage.get_graph(project_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found for this project. Ensure indexing has completed.")

    # Apply filters
    filtered_nodes = graph.nodes
    type_set = set(node_types.split(",")) if node_types else None
    lang_set = set(languages.split(",")) if languages else None
    search_lower = search.lower().strip() if search else None

    if type_set:
        filtered_nodes = [n for n in filtered_nodes if n.type.value in type_set]

    if lang_set:
        filtered_nodes = [n for n in filtered_nodes if not n.language or n.language in lang_set]

    if search_lower:
        filtered_nodes = [
            n for n in filtered_nodes
            if search_lower in n.name.lower() or (n.file_path and search_lower in n.file_path.lower())
        ]

    # Limit node count for rendering safety
    if len(filtered_nodes) > max_nodes:
        # Prioritize files and classes over small functions
        type_priority = {NodeType.DIRECTORY: 4, NodeType.FILE: 3, NodeType.CLASS: 2, NodeType.FUNCTION: 1}
        filtered_nodes.sort(key=lambda n: (type_priority.get(n.type, 0), n.metrics.loc), reverse=True)
        filtered_nodes = filtered_nodes[:max_nodes]

    visible_node_ids = {n.id for n in filtered_nodes}

    # Only include edges connecting visible nodes
    filtered_edges = [
        e for e in graph.edges
        if e.source in visible_node_ids and e.target in visible_node_ids
    ]

    return CodeGraph(
        project_id=project_id,
        nodes=filtered_nodes,
        edges=filtered_edges,
        stats={
            "total_nodes": len(filtered_nodes),
            "total_edges": len(filtered_edges),
            "unfiltered_total_nodes": len(graph.nodes)
        }
    )

@router.get("/nodes/{node_id:path}")
async def get_node_details(project_id: str, node_id: str):
    graph = await storage.get_graph(project_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found.")

    node = next((n for n in graph.nodes if n.id == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found.")

    # Find incoming and outgoing edges
    incoming = [e for e in graph.edges if e.target == node_id]
    outgoing = [e for e in graph.edges if e.source == node_id]

    node_map = {n.id: n for n in graph.nodes}

    return {
        "node": node,
        "incoming_connections": [
            {"edge": e, "source_node": node_map.get(e.source)} for e in incoming
        ],
        "outgoing_connections": [
            {"edge": e, "target_node": node_map.get(e.target)} for e in outgoing
        ]
    }
