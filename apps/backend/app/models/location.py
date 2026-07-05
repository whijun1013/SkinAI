from sqlalchemy import Column, BigInteger, Integer, String, DateTime, Numeric, ForeignKey, CheckConstraint
from sqlalchemy.sql import func
from app.database import Base


class UserLocation(Base):
    __tablename__ = "user_location"
    __table_args__ = (
        CheckConstraint("location_type IN ('home','work')", name="chk_location_type"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    location_type = Column(String(10), nullable=False)
    location_name = Column(String(100), nullable=True)
    lat = Column(Numeric(9, 6), nullable=False)
    lng = Column(Numeric(9, 6), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

