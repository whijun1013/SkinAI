import pytest
import os
from unittest.mock import patch, MagicMock
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from jose import jwt
import base64
import asyncio
from fastapi import HTTPException
from app.schemas.auth import AppleLoginRequest
from app.routers.auth import apple_login

def int_to_base64url(val):
    val_bytes = val.to_bytes((val.bit_length() + 7) // 8, byteorder='big')
    return base64.urlsafe_b64encode(val_bytes).decode('utf-8').rstrip('=')

# Generate test RSA key once
private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
pem = private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.TraditionalOpenSSL,
    encryption_algorithm=serialization.NoEncryption()
)
public_numbers = private_key.public_key().public_numbers()
test_jwk = {
    "kty": "RSA",
    "kid": "test-kid",
    "use": "sig",
    "alg": "RS256",
    "n": int_to_base64url(public_numbers.n),
    "e": int_to_base64url(public_numbers.e)
}

def create_apple_token(payload_overrides=None):
    payload = {
        "iss": "https://appleid.apple.com",
        "aud": "com.luvel.app",
        "sub": "apple.user.123",
        "email": "test@apple.com"
    }
    if payload_overrides:
        payload.update(payload_overrides)
        if "email" in payload_overrides and payload_overrides["email"] is None:
            del payload["email"]
        if "sub" in payload_overrides and payload_overrides["sub"] is None:
            del payload["sub"]
            
    return jwt.encode(payload, pem, algorithm="RS256", headers={"kid": "test-kid"})

@pytest.fixture
def mock_httpx_get():
    with patch("httpx.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = {"keys": [test_jwk]}
        mock_get.return_value = mock_response
        yield mock_get

@pytest.fixture
def mock_auth_deps():
    with patch("app.routers.auth.get_or_create_social_user") as mock_get_user, \
         patch("app.routers.auth.create_token_pair") as mock_create_token:
        
        mock_user = MagicMock()
        mock_get_user.return_value = (mock_user, True)
        mock_create_token.return_value = {
            "access_token": "test_access",
            "refresh_token": "test_refresh",
            "token_type": "bearer",
            "user": mock_user
        }
        yield mock_get_user, mock_create_token

@patch.dict(os.environ, {"APPLE_CLIENT_ID": "com.luvel.app"})
def test_apple_login_success(mock_httpx_get, mock_auth_deps):
    mock_get_user, mock_create_token = mock_auth_deps
    token = create_apple_token()
    req = AppleLoginRequest(identity_token=token, full_name="Apple User")
    
    result = asyncio.run(apple_login(req, db=MagicMock()))
    
    assert result["access_token"] == "test_access"
    assert result["provider"] == "apple"
    assert result["is_new_user"] is True
    
    # Check that SocialProfile was created correctly
    profile_arg = mock_get_user.call_args[0][0]
    assert profile_arg.provider == "apple"
    assert profile_arg.email == "test@apple.com"
    assert profile_arg.provider_user_id == "apple.user.123"
    assert profile_arg.name == "Apple User"

@patch.dict(os.environ, {"APPLE_CLIENT_ID": "com.luvel.app"})
def test_apple_login_missing_email_fallback(mock_httpx_get, mock_auth_deps):
    mock_get_user, mock_create_token = mock_auth_deps
    token = create_apple_token({"email": None})
    req = AppleLoginRequest(identity_token=token, full_name=None)
    
    asyncio.run(apple_login(req, db=MagicMock()))
    profile_arg = mock_get_user.call_args[0][0]
    # Check fallback email
    assert profile_arg.email == "apple_apple.user.123@apple.social"

@patch.dict(os.environ, {"APPLE_CLIENT_ID": "com.luvel.app"})
def test_apple_login_audience_mismatch(mock_httpx_get):
    # sign with different audience
    token = create_apple_token({"aud": "wrong.app"})
    req = AppleLoginRequest(identity_token=token)
    
    with pytest.raises(HTTPException) as exc:
        asyncio.run(apple_login(req, db=MagicMock()))
        
    assert exc.value.status_code == 400
    assert "Invalid Apple identityToken" in exc.value.detail

@patch.dict(os.environ, {"APPLE_CLIENT_ID": "com.luvel.app"})
def test_apple_login_missing_sub(mock_httpx_get):
    token = create_apple_token({"sub": None})
    req = AppleLoginRequest(identity_token=token)
    
    with pytest.raises(HTTPException) as exc:
        asyncio.run(apple_login(req, db=MagicMock()))
        
    assert exc.value.status_code == 400
    assert "Missing sub" in exc.value.detail
