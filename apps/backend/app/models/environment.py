from sqlalchemy import Column, BigInteger, Integer, String, DateTime, Date, Numeric, SmallInteger, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.mysql import TINYINT
from app.database import Base


class EnvironmentLog(Base):
    __tablename__ = "environment_log"
    __table_args__ = (
        CheckConstraint("source IN ('app_camera', 'exif', 'manual', 'retroactive')", name="chk_source"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    logged_at = Column(Date, nullable=False, index=True)
    lat = Column(Numeric(9, 6), nullable=True)
    lng = Column(Numeric(9, 6), nullable=True)
    location_name = Column(String(100), nullable=True)
    temperature = Column(Numeric(5, 2), nullable=True)
    humidity = Column(TINYINT, nullable=True)
    pm10 = Column(SmallInteger, nullable=True)
    pm25 = Column(SmallInteger, nullable=True)
    uv_index = Column(TINYINT, nullable=True)
    weather = Column(String(50), nullable=True)
    source = Column(String(20), nullable=False)
    captured_at = Column(DateTime, nullable=False)
    
    diet_log_id = Column(BigInteger, ForeignKey("diet_log.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    diet_log = relationship("DietLog", back_populates="environment_logs")


