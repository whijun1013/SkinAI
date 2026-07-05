from pydantic import BaseModel, EmailStr, constr

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: constr(min_length=8, max_length=72)

class AppleLoginRequest(BaseModel):
    identity_token: str
    full_name: str | None = None
    authorization_code: str | None = None
