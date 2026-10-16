from app.parser.python_parser import PythonParser
from app.graph.builder import graph_builder
from app.graph.impact import impact_engine

def test_change_impact_blast_radius():
    # Service imports Database; API imports Service
    db_code = "class Database:\n    def connect(self): pass"
    service_code = "from db import Database\nclass Service:\n    def __init__(self): self.db = Database()"
    api_code = "from service import Service\nsvc = Service()"
    test_code = "from service import Service\ndef test_svc(): pass"

    parser = PythonParser()
    pf_db = parser.parse_code(db_code, "db.py", "db.py")
    pf_svc = parser.parse_code(service_code, "service.py", "service.py")
    pf_api = parser.parse_code(api_code, "api.py", "api.py")
    pf_test = parser.parse_code(test_code, "test_service.py", "test_service.py")

    graph = graph_builder.build("test-impact", [pf_db, pf_svc, pf_api, pf_test])

    # Modifying db.py should have service.py, api.py, and test_service.py in its blast radius
    impact = impact_engine.analyze_impact(graph, "file:db.py")
    assert impact is not None
    assert impact.target_node_id == "file:db.py"

    blast_ids = {item["id"] for item in impact.total_blast_radius}
    assert "file:service.py" in blast_ids
    assert "file:api.py" in blast_ids

    # Related tests
    assert "test_service.py" in impact.related_tests
