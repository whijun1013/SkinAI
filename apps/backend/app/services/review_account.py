import os
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.user import User
from app.auth.security import get_password_hash, verify_password

def is_reviewer_login_enabled() -> bool:
    val = os.getenv("ENABLE_REVIEW_ACCOUNT_LOGIN", "false").lower()
    return val in ("1", "true", "yes", "on")

def try_review_account_login(email: str, password: str, db: Session) -> User | None:
    if not is_reviewer_login_enabled():
        return None
        
    env_email = os.getenv("REVIEW_ACCOUNT_EMAIL", "").strip()
    env_password = os.getenv("REVIEW_ACCOUNT_PASSWORD", "")
    
    if not env_email or not env_password:
        return None
        
    if email != env_email or password != env_password:
        return None
        
    env_name = os.getenv("REVIEW_ACCOUNT_NAME", "Luvel Reviewer").strip()
    
    user = db.query(User).filter(User.email == env_email).first()
    if not user:
        user = User(
            email=env_email,
            name=env_name,
            hashed_password=get_password_hash(password),
            skin_type="중성",
            birth_year=1990,
            gender="남",
            is_onboarded=True,
            is_admin=False,
            terms_agreed_at=datetime.utcnow(),
        )
        db.add(user)
    else:
        if not verify_password(password, user.hashed_password):
            user.hashed_password = get_password_hash(password)
        user.name = env_name
        user.is_onboarded = True
        user.is_admin = False
        if not user.terms_agreed_at:
            user.terms_agreed_at = datetime.utcnow()
        if not user.skin_type:
            user.skin_type = "중성"
        if not user.birth_year:
            user.birth_year = 1990
        if not user.gender:
            user.gender = "남"
            
    db.commit()
    db.refresh(user)
    return user
