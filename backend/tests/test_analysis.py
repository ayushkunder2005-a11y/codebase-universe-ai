from app.parser.python_parser import PythonParser
from app.graph.builder import graph_builder
from app.graph.algorithms import graph_algorithms
from app.analysis.quality import quality_analyzer
from app.models.project import ProjectStats
from app.models.analysis import FindingCategory

def test_circular_dependency_detection():
    # Module A imports Module B, Module B imports Module A
    code_a = "from mod_b import func_b\ndef func_a(): return func_b()"
    code_b = "from mod_a import func_a\ndef func_b(): return func_a()"

    parser = PythonParser()
    pfa = parser.parse_code(code_a, "mod_a.py", "mod_a.py")
    pfb = parser.parse_code(code_b, "mod_b.py", "mod_b.py")

    graph = graph_builder.build("test-cycles", [pfa, pfb])
    cycles = graph_algorithms.detect_circular_dependencies(graph)

    assert len(cycles) >= 1
    # Check that both files are present in the cycle
    cycle_files = set(cycles[0])
    assert "mod_a.py" in cycle_files
    assert "mod_b.py" in cycle_files

def test_quality_analyzer_report():
    code = """
import unused_lib

def complex_routine(x, y, z):
    if x > 0:
        if y > 0:
            if z > 0:
                return x + y + z
            else:
                return x + y
        elif y < -10:
            return x - y
    elif x < -5:
        while z > 0:
            z -= 1
    return 0
"""
    parser = PythonParser()
    pf = parser.parse_code(code, "complex.py", "complex.py")
    graph = graph_builder.build("test-quality", [pf])

    stats = ProjectStats(total_files=1, total_lines_of_code=pf.loc, average_complexity=6.0)
    report = quality_analyzer.analyze(graph, stats)

    assert report.overall_health_score < 100.0
    categories = {f.category for f in report.findings}
    assert FindingCategory.UNUSED_IMPORT in categories
