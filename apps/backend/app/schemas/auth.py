from pydantic import BaseModel, EmailStr, constr

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: constr(min_length=8, max_length=72)

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: constr(min_length=8, max_length=72)
