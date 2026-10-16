from app.parser.python_parser import PythonParser
from app.graph.builder import graph_builder
from app.models.graph import NodeType, EdgeType

def test_graph_builder_creates_nodes_and_edges():
    p1_code = """
from helper import compute

def main_flow():
    return compute(42)
"""
    p2_code = """
def compute(val: int) -> int:
    return val * 2
"""
    parser = PythonParser()
    pf1 = parser.parse_code(p1_code, "app/main.py", "app/main.py")
    pf2 = parser.parse_code(p2_code, "app/helper.py", "app/helper.py")

    graph = graph_builder.build("test-proj", [pf1, pf2])

    assert len(graph.nodes) > 0
    node_ids = {n.id for n in graph.nodes}
    assert "file:app/main.py" in node_ids
    assert "file:app/helper.py" in node_ids
    assert "function:app/main.py:main_flow" in node_ids
    assert "function:app/helper.py:compute" in node_ids

    # Verify import edge exists
    import_edges = [e for e in graph.edges if e.type == EdgeType.IMPORTS]
    assert len(import_edges) >= 1
    assert import_edges[0].source == "file:app/main.py"
    assert import_edges[0].target == "file:app/helper.py"

    # Verify 3D positions are computed
    for n in graph.nodes:
        assert isinstance(n.position.x, float)
        assert isinstance(n.position.y, float)
        assert isinstance(n.position.z, float)
