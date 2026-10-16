# Sample test file for auth
from auth.jwt import create_access_token, verify_token
from auth.user import UserManager

def test_token_creation():
    token = create_access_token("u1")
    assert verify_token(token) is True

def test_user_manager():
    manager = UserManager()
    token = create_access_token("u1")
    user = manager.authenticate(token)
    assert user is not None
