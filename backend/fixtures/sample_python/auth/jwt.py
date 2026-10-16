# Sample Python fixture - Auth JWT
import os
import sys  # Unused import on purpose
from auth.user import get_user_by_id

SECRET_KEY = "universe_secret"

def create_access_token(user_id: str) -> str:
    user = get_user_by_id(user_id)
    return f"token_for_{user['name']}"

def verify_token(token: str) -> bool:
    if not token or len(token) < 5:
        return False
    return token.startswith("token_for_")
