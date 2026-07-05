from fastapi import HTTPException

EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS"
EMAIL_REGISTERED_WITH_SOCIAL = "EMAIL_REGISTERED_WITH_SOCIAL"
PASSWORD_TOO_SHORT = "PASSWORD_TOO_SHORT"
PASSWORD_TOO_LONG = "PASSWORD_TOO_LONG"


def raise_auth_error(status_code: int, code: str, message: str, **extra) -> None:
    detail = {"code": code, "message": message, **extra}
    raise HTTPException(status_code=status_code, detail=detail)
