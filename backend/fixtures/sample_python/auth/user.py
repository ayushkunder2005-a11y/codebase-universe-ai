# Sample Python fixture - Auth User
from auth.jwt import verify_token

class UserManager:
    """Manages active user sessions."""
    def __init__(self):
        self.users = {"u1": {"id": "u1", "name": "Alice"}}

    def authenticate(self, token: str):
        if verify_token(token):
            return self.users.get("u1")
        return None

def get_user_by_id(user_id: str):
    return {"id": user_id, "name": "Alice"}
