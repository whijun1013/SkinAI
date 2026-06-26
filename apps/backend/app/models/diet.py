from sqlalchemy import Column, BigInteger, Integer, String, Text, DateTime, Boolean, Numeric, ForeignKey, CheckConstraint, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class FoodItem(Base):
    __tablename__ = "food_item"

    id = Column(BigInteger, primary_key=True, index=True)
    api_food_code = Column(String(100), nullable=True, index=True, unique=True)
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=True)
    calories = Column(Numeric(8, 2), nullable=True)
    carbohydrate = Column(Numeric(8, 2), nullable=True)
    sugar = Column(Numeric(8, 2), nullable=True)
    protein = Column(Numeric(8, 2), nullable=True)
    fat = Column(Numeric(8, 2), nullable=True)
    saturated_fat = Column(Numeric(8, 2), nullable=True)
    trans_fat = Column(Numeric(8, 2), nullable=True)
    sodium = Column(Numeric(8, 2), nullable=True)
    raw_material_text = Column(Text, nullable=True)
    allergen_text = Column(Text, nullable=True)
    skin_factors = Column(JSON, nullable=True)
    source = Column(String(20), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())


class DietLog(Base):
    """
    DietLog model representing user meal logs.
    
    Note on captured_at:
    The 'diet_log' table does not have a separate 'captured_at' column in the database.
    Instead, 'captured_at' (extracted from EXIF photo metadata) is treated as an input-only parameter.
    When a photo-based log is submitted, the resolved consumption time (which prioritizes captured_at)
    is saved directly in the 'logged_at' column. The linked 'EnvironmentLog' stores the 'captured_at'
    value in its own column for weather/environment tracking.
    """
    __tablename__ = "diet_log"
    __table_args__ = (
        CheckConstraint("meal_type IN ('아침','점심','저녁','간식')", name="chk_meal_type"),
        CheckConstraint("input_method IN ('photo','manual')", name="chk_input_method"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    logged_at = Column(DateTime, nullable=False, index=True)
    meal_type = Column(String(20), nullable=True)
    input_method = Column(String(20), nullable=True)
    photo_url = Column(String(500), nullable=True)
    captured_lat = Column(Numeric(9, 6), nullable=True)
    captured_lng = Column(Numeric(9, 6), nullable=True)
    captured_location_name = Column(String(100), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    items = relationship("DietLogItem", back_populates="diet_log", cascade="all, delete-orphan")
    environment_logs = relationship("EnvironmentLog", back_populates="diet_log", passive_deletes=True)


class DietLogItem(Base):
    __tablename__ = "diet_log_item"

    id = Column(BigInteger, primary_key=True, index=True)
    diet_log_id = Column(BigInteger, ForeignKey("diet_log.id", ondelete="CASCADE"), nullable=False, index=True)
    food_item_id = Column(BigInteger, ForeignKey("food_item.id", ondelete="SET NULL"), nullable=True)
    custom_food_name = Column(String(255), nullable=True)
    amount = Column(Numeric(8, 2), nullable=True)
    unit = Column(String(20), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    diet_log = relationship("DietLog", back_populates="items")
    food_item = relationship("FoodItem")

