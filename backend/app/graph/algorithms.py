from typing import List, Dict, Set, Any
import networkx as nx

from app.models.graph import CodeGraph, NodeType, EdgeType
from app.models.analysis import (
    AnalysisFinding, FindingCategory, FindingSeverity, ComponentRisk
)

class GraphAlgorithms:
    def detect_circular_dependencies(self, graph: CodeGraph) -> List[List[str]]:
        """
        Detects circular dependency cycles among files in the graph using NetworkX.
        Returns cycles formatted as lists of file paths.
        """
        dg = nx.DiGraph()
        
        # Build file-level dependency graph
        file_nodes = {n.id: n.file_path for n in graph.nodes if n.type == NodeType.FILE and n.file_path}
        for n_id in file_nodes:
            dg.add_node(n_id)

        for edge in graph.edges:
            if edge.type == EdgeType.IMPORTS:
                if edge.source in file_nodes and edge.target in file_nodes and edge.source != edge.target:
                    dg.add_edge(edge.source, edge.target)

        raw_cycles = list(nx.simple_cycles(dg))
        formatted_cycles = []
        for cycle in raw_cycles:
            # Map back to readable file paths
            path_cycle = [file_nodes.get(nid, nid) for nid in cycle]
            path_cycle.append(path_cycle[0])  # Close the cycle loop for display
            formatted_cycles.append(path_cycle)

        return formatted_cycles

    def identify_risks_and_hotspots(self, graph: CodeGraph) -> Tuple[List[AnalysisFinding], List[ComponentRisk]]:
        findings: List[AnalysisFinding] = []
        risks: List[ComponentRisk] = []

        # 1. Circular Dependencies
        cycles = self.detect_circular_dependencies(graph)
        for idx, cycle in enumerate(cycles):
            cycle_str = " -> ".join(cycle)
            findings.append(AnalysisFinding(
                id=f"cycle-{idx+1}",
                category=FindingCategory.CIRCULAR_DEPENDENCY,
                severity=FindingSeverity.ERROR,
                title=f"Circular Dependency Cycle ({len(cycle)-1} files)",
                description=f"Cyclic import detected: {cycle_str}. Circular imports can cause runtime import errors, tight coupling, and difficult testing.",
                file_path=cycle[0],
                affected_nodes=[f"file:{f}" for f in cycle[:-1]],
                recommendation="Extract shared abstractions, interfaces, or types into an independent module to break the loop.",
                evidence_type="static_analysis"
            ))

        # 2. Inspect individual nodes
        for node in graph.nodes:
            # God component / Excessive LOC
            if node.type == NodeType.FILE and node.metrics.loc > 350:
                findings.append(AnalysisFinding(
                    id=f"god-file-{node.id}",
                    category=FindingCategory.GOD_COMPONENT,
                    severity=FindingSeverity.WARNING,
                    title=f"Large File ({node.metrics.loc} lines)",
                    description=f"File '{node.file_path}' has {node.metrics.loc} lines of code. Large files often violate the Single Responsibility Principle.",
                    file_path=node.file_path,
                    affected_nodes=[node.id],
                    recommendation="Consider breaking this file into smaller, focused modules.",
                    evidence_type="static_analysis"
                ))

            # High Cyclomatic Complexity
            if node.type == NodeType.FUNCTION and node.metrics.complexity >= 8:
                severity = FindingSeverity.CRITICAL if node.metrics.complexity >= 15 else FindingSeverity.WARNING
                findings.append(AnalysisFinding(
                    id=f"complexity-{node.id}",
                    category=FindingCategory.HIGH_COMPLEXITY,
                    severity=severity,
                    title=f"High Complexity Function: '{node.name}' (Cyclomatic: {node.metrics.complexity})",
                    description=f"Function '{node.name}' has cyclomatic complexity of {node.metrics.complexity}, indicating numerous nested control paths.",
                    file_path=node.file_path,
                    line_start=node.line_start,
                    line_end=node.line_end,
                    affected_nodes=[node.id],
                    recommendation="Decompose nested if/loops into separate helper functions.",
                    evidence_type="static_analysis"
                ))

            # Unused Imports
            unused = node.metadata.get("unused_imports", [])
            if unused:
                findings.append(AnalysisFinding(
                    id=f"unused-imports-{node.id}",
                    category=FindingCategory.UNUSED_IMPORT,
                    severity=FindingSeverity.INFO,
                    title=f"Unused Imports in '{node.name}'",
                    description=f"The following symbols are imported but not referenced: {', '.join(unused)}.",
                    file_path=node.file_path,
                    affected_nodes=[node.id],
                    recommendation="Remove unused imports to keep code clean and reduce load time.",
                    evidence_type="static_analysis"
                ))

            # High Coupling
            if node.metrics.coupling_score >= 12:
                findings.append(AnalysisFinding(
                    id=f"coupling-{node.id}",
                    category=FindingCategory.HIGH_COUPLING,
                    severity=FindingSeverity.WARNING,
                    title=f"High Coupling: '{node.name}' (In: {node.metrics.in_degree}, Out: {node.metrics.out_degree})",
                    description=f"Component '{node.name}' interacts with many other components. High coupling makes changes risky and ripple across the repository.",
                    file_path=node.file_path,
                    affected_nodes=[node.id],
                    recommendation="Apply dependency inversion or introduce an event/facade pattern.",
                    evidence_type="static_analysis"
                ))

            # Track top component risks
            if node.metrics.risk_score >= 30.0:
                factors = []
                if node.metrics.complexity > 5:
                    factors.append(f"High complexity ({node.metrics.complexity})")
                if node.metrics.coupling_score > 6:
                    factors.append(f"High coupling ({node.metrics.coupling_score})")
                if node.metrics.loc > 200:
                    factors.append(f"Large code size ({node.metrics.loc} LOC)")

                risks.append(ComponentRisk(
                    node_id=node.id,
                    name=node.name,
                    file_path=node.file_path or "",
                    risk_score=node.metrics.risk_score,
                    factors=factors,
                    blast_radius_size=node.metrics.in_degree,
                    complexity=node.metrics.complexity,
                    coupling=node.metrics.coupling_score
                ))

        risks.sort(key=lambda r: r.risk_score, reverse=True)
        return findings, risks

from typing import Tuple
graph_algorithms = GraphAlgorithms()
