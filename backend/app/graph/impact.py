from typing import List, Dict, Set, Any, Optional
import networkx as nx

from app.models.graph import CodeGraph, NodeType, EdgeType
from app.models.analysis import ImpactAnalysisResult

class ChangeImpactEngine:
    def analyze_impact(self, graph: CodeGraph, target_node_id: str) -> Optional[ImpactAnalysisResult]:
        # Locate target node
        target_node = next((n for n in graph.nodes if n.id == target_node_id), None)
        if not target_node:
            # Fallback search by partial match or file path
            target_node = next((n for n in graph.nodes if n.file_path == target_node_id or n.name == target_node_id), None)
        
        if not target_node:
            return None

        # Build directed graph where edge A -> B means A depends on B (A imports B or calls B)
        dep_graph = nx.DiGraph()
        for n in graph.nodes:
            dep_graph.add_node(n.id, name=n.name, type=n.type.value, file_path=n.file_path)

        for e in graph.edges:
            if e.type in (EdgeType.IMPORTS, EdgeType.CALLS, EdgeType.INHERITS_FROM):
                # source depends on target
                dep_graph.add_edge(e.source, e.target)

        # Direct dependencies: what target requires (successors in dep_graph)
        direct_dependencies = []
        if target_node.id in dep_graph:
            for succ_id in dep_graph.successors(target_node.id):
                succ_data = dep_graph.nodes[succ_id]
                direct_dependencies.append({
                    "id": succ_id,
                    "name": succ_data.get("name", succ_id),
                    "type": succ_data.get("type", "unknown"),
                    "file_path": succ_data.get("file_path")
                })

        # Direct dependents: what depends on target directly (predecessors in dep_graph)
        direct_dependents = []
        if target_node.id in dep_graph:
            for pred_id in dep_graph.predecessors(target_node.id):
                pred_data = dep_graph.nodes[pred_id]
                direct_dependents.append({
                    "id": pred_id,
                    "name": pred_data.get("name", pred_id),
                    "type": pred_data.get("type", "unknown"),
                    "file_path": pred_data.get("file_path")
                })

        # Total Blast Radius: Transitive reverse closure (who depends on target directly or indirectly)
        # Reverse edges and run BFS/DFS
        rev_graph = dep_graph.reverse(copy=False)
        blast_radius_ids: Set[str] = set()
        if target_node.id in rev_graph:
            blast_radius_ids = set(nx.descendants(rev_graph, target_node.id))

        total_blast_radius = []
        for nid in blast_radius_ids:
            ndata = dep_graph.nodes[nid]
            total_blast_radius.append({
                "id": nid,
                "name": ndata.get("name", nid),
                "type": ndata.get("type", "unknown"),
                "file_path": ndata.get("file_path")
            })

        # Identify related tests
        all_test_nodes = [
            n for n in graph.nodes
            if n.file_path and (
                "test" in n.file_path.lower() or
                n.file_path.endswith(("_test.py", ".spec.ts", ".test.ts", ".spec.js", ".test.js"))
            )
        ]

        related_tests: Set[str] = set()
        target_stem = target_node.file_path.split("/")[-1].split(".")[0] if target_node.file_path else ""

        # 1. Tests in direct blast radius
        for item in total_blast_radius:
            fp = item.get("file_path")
            if fp and "test" in fp.lower():
                related_tests.add(fp)

        # 2. Name-matched tests
        for tn in all_test_nodes:
            if tn.file_path and (target_stem in tn.file_path or f"test_{target_stem}" in tn.file_path):
                related_tests.add(tn.file_path)

        sorted_tests = sorted(list(related_tests))

        # Suggested test commands
        test_commands = []
        py_tests = [t for t in sorted_tests if t.endswith(".py")]
        js_tests = [t for t in sorted_tests if t.endswith((".ts", ".js", ".tsx", ".jsx"))]

        if py_tests:
            test_commands.append(f"pytest {' '.join(py_tests[:3])}")
        if js_tests:
            test_commands.append(f"npm test -- {' '.join(js_tests[:3])}")
        if not test_commands:
            test_commands.append("pytest" if any(n.language == "python" for n in graph.nodes) else "npm test")

        # Risk assessment level
        blast_count = len(total_blast_radius)
        if blast_count > 15:
            risk_level = "CRITICAL / HIGH BLAST RADIUS"
            summary = f"Modifying '{target_node.name}' has high ripple potential across {blast_count} components. Thorough regression testing required."
        elif blast_count > 5:
            risk_level = "MODERATE BLAST RADIUS"
            summary = f"Modifying '{target_node.name}' affects {blast_count} downstream components. Ensure unit and integration tests pass."
        else:
            risk_level = "LOW BLAST RADIUS"
            summary = f"Modifying '{target_node.name}' has localized impact on {blast_count} components."

        return ImpactAnalysisResult(
            target_node_id=target_node.id,
            target_name=target_node.name,
            target_type=target_node.type.value,
            file_path=target_node.file_path,
            direct_dependencies=direct_dependencies,
            direct_dependents=direct_dependents,
            total_blast_radius=total_blast_radius,
            related_tests=sorted_tests,
            suggested_test_commands=test_commands,
            risk_assessment=risk_level,
            potential_impact_summary=summary
        )

impact_engine = ChangeImpactEngine()
