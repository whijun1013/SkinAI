from sqlalchemy import Column, DateTime, ForeignKey, Integer, SmallInteger, String, Boolean, JSON, Text, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("skin_type IN ('건성','지성','복합성','민감성','중성')", name="chk_skin_type"),
        CheckConstraint("gender IN ('남','여')", name="chk_gender"),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(50), nullable=False)
    hashed_password = Column(String(60), nullable=False)
    skin_type = Column(String(20), nullable=True)
    skin_concerns = Column(JSON, nullable=True)
    raw_concern_text = Column(Text, nullable=True)
    birth_year = Column(SmallInteger, nullable=True)
    gender = Column(String(10), nullable=True)
    avg_cycle_length = Column(SmallInteger, nullable=True)
    cycle_regularity = Column(String(20), nullable=True)
    is_onboarded = Column(Boolean, nullable=False, default=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default="active", server_default="active")
    session_version = Column(Integer, nullable=False, default=1, server_default="1")
    terms_agreed_at = Column(DateTime, nullable=True)
    push_token = Column(String(200), nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    social_accounts = relationship("SocialAccount", back_populates="user", cascade="all, delete-orphan")
    cosmetics = relationship("UserCosmetic", backref="user", cascade="all, delete-orphan")
    medications = relationship("UserMedication", backref="user", cascade="all, delete-orphan")



class SocialAccount(Base):
    __tablename__ = "social_accounts"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_user_id",
            name="uq_social_accounts_provider_user_id",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), nullable=False)
    provider_user_id = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    user = relationship("User", back_populates="social_accounts")
