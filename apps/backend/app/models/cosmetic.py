from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Date, ForeignKey, Table, SmallInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

cosmetic_ingredient_map = Table(
    'cosmetic_ingredient_map',
    Base.metadata,
    Column('product_id', ForeignKey('cosmetic_products.id', ondelete='CASCADE'), primary_key=True),
    Column('ingredient_id', ForeignKey('cosmetic_ingredients.id', ondelete='CASCADE'), primary_key=True)
)


class CosmeticIngredient(Base):
    __tablename__ = "cosmetic_ingredients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    english_name = Column(Text, nullable=True)
    cas_no = Column(String(100), nullable=True)
    origin = Column(Text, nullable=True)
    is_irritant = Column(Boolean, default=False, nullable=False)
    is_banned = Column(Boolean, default=False, nullable=False)
    restriction_limit = Column(String(255), nullable=True)
    comedogenic = Column(SmallInteger, nullable=True)
    comedogenic_source = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

class CosmeticProduct(Base):
    __tablename__ = "cosmetic_products"

    id = Column(Integer, primary_key=True, index=True)
    brand = Column(String(100), index=True, nullable=False)
    product_name = Column(String(255), index=True, nullable=False)
    ingredients = Column(Text(16777215), nullable=True)
    category = Column(String(100), nullable=True)
    image_url = Column(String(500), nullable=True)
    source = Column(String(50), nullable=True)
    source_product_id = Column(String(100), nullable=True)
    product_url = Column(String(500), nullable=True)
    status = Column(String(50), nullable=True)
    normalized_name = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    ingredients_list = relationship("CosmeticIngredient", secondary=cosmetic_ingredient_map, backref="products")


class UserCosmetic(Base):
    __tablename__ = "user_cosmetics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("cosmetic_products.id", ondelete="CASCADE"), nullable=False)
    is_current = Column(Boolean, nullable=True)
    started_at = Column(Date, nullable=True)
    ended_at = Column(Date, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    product = relationship("CosmeticProduct")


class PendingCosmeticProduct(Base):
    __tablename__ = "pending_cosmetic_products"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    brand = Column(String(100), nullable=False)
    product_name = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="pending") # 'pending', 'approved', 'rejected'
    ingredients_text = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    source_note = Column(Text, nullable=True)
    reject_reason = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    user = relationship("User", foreign_keys=[user_id])


Cosmetic = CosmeticProduct
