import sys
from pathlib import Path
import pytest
from starlette.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
