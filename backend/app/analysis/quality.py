from datetime import datetime
from typing import Dict, Any

from app.models.graph import CodeGraph
from app.models.project import ProjectStats
from app.models.analysis import AnalysisReport, FindingSeverity
from app.graph.algorithms import graph_algorithms

class CodeQualityAnalyzer:
    def analyze(self, graph: CodeGraph, stats: ProjectStats) -> AnalysisReport:
        findings, risks = graph_algorithms.identify_risks_and_hotspots(graph)
        cycles = graph_algorithms.detect_circular_dependencies(graph)

        # Calculate Overall Health Score
        score = 100.0
        for f in findings:
            if f.severity == FindingSeverity.CRITICAL:
                score -= 8.0
            elif f.severity == FindingSeverity.ERROR:
                score -= 5.0
            elif f.severity == FindingSeverity.WARNING:
                score -= 2.0
            elif f.severity == FindingSeverity.INFO:
                score -= 0.5

        # Penalize circular cycles heavily
        score -= len(cycles) * 6.0
        health_score = max(5.0, min(100.0, round(score, 1)))

        summary: Dict[str, Any] = {
            "health_score": health_score,
            "total_findings": len(findings),
            "critical_count": sum(1 for f in findings if f.severity == FindingSeverity.CRITICAL),
            "error_count": sum(1 for f in findings if f.severity == FindingSeverity.ERROR),
            "warning_count": sum(1 for f in findings if f.severity == FindingSeverity.WARNING),
            "info_count": sum(1 for f in findings if f.severity == FindingSeverity.INFO),
            "cycle_count": len(cycles),
            "average_complexity": stats.average_complexity,
            "total_loc": stats.total_lines_of_code
        }

        return AnalysisReport(
            project_id=graph.project_id,
            generated_at=datetime.utcnow(),
            overall_health_score=health_score,
            findings=findings,
            circular_dependencies=cycles,
            top_risks=risks[:10],
            summary=summary
        )

quality_analyzer = CodeQualityAnalyzer()
