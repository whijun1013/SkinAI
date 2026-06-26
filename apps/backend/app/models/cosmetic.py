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


Cosmetic = CosmeticProduct
