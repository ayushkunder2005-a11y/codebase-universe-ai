def test_health_check_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "database" in data

def test_projects_crud_and_graph(client):
    # 1. Load sample python project
    resp = client.post("/api/projects/samples/python")
    assert resp.status_code == 200
    project = resp.json()
    proj_id = project["id"]
    assert proj_id is not None

    # 2. Get project details
    get_resp = client.get(f"/api/projects/{proj_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == proj_id

    # 3. List projects
    list_resp = client.get("/api/projects")
    assert list_resp.status_code == 200
    assert any(p["id"] == proj_id for p in list_resp.json())

    # 4. Fetch graph
    graph_resp = client.get(f"/api/projects/{proj_id}/graph")
    assert graph_resp.status_code == 200
    graph = graph_resp.json()
    assert len(graph["nodes"]) > 0

    # 5. Fetch analysis
    analysis_resp = client.get(f"/api/projects/{proj_id}/analysis")
    assert analysis_resp.status_code == 200
    analysis = analysis_resp.json()
    assert "overall_health_score" in analysis
    assert len(analysis["findings"]) > 0

    # 6. Ask AI Assistant
    chat_resp = client.post(f"/api/projects/{proj_id}/chat", json={
        "project_id": proj_id,
        "message": "Where is the access token created?"
    })
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert "reply" in chat_data
    assert len(chat_data["citations"]) >= 0

    # 7. Check impact analysis
    impact_resp = client.get(f"/api/projects/{proj_id}/impact?target_node_id=file:auth/jwt.py")
    assert impact_resp.status_code == 200
    impact_data = impact_resp.json()
    assert impact_data["target_node_id"] == "file:auth/jwt.py"
