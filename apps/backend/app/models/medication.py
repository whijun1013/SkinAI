from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, Date, ForeignKey, Table, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

medication_ingredient_map = Table(
    'medication_ingredient_map',
    Base.metadata,
    Column('medication_id', BigInteger, ForeignKey('medication.id', ondelete='CASCADE'), primary_key=True),
    Column('ingredient_id', BigInteger, ForeignKey('medication_ingredient.id', ondelete='CASCADE'), primary_key=True)
)


class MedicationIngredient(Base):
    __tablename__ = "medication_ingredient"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    english_name = Column(String(255), nullable=True) # Phase 2 added
    drug_class = Column(String(100), nullable=True)
    is_skin_relevant = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())


class Medication(Base):
    __tablename__ = "medication"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String(255), index=True, nullable=False)
    english_name = Column(String(255), nullable=True) # Phase 2 added
    form = Column(String(100), nullable=True)
    manufacturer = Column(String(255), nullable=True) # Phase 2
    item_seq = Column(String(50), nullable=True, unique=True) # Phase 2 식약처 품목기준코드
    valid_term = Column(String(100), nullable=True) # Phase 2 유효기간
    storage_method = Column(String(255), nullable=True) # Phase 2 보관방법
    material_name = Column(Text, nullable=True) # Phase 2 원료성분
    license_status = Column(String(50), nullable=True)
    license_date = Column(Date, nullable=True)
    cancel_date = Column(Date, nullable=True)
    efficacy_group = Column(String(100), nullable=True)
    prescription_type = Column(String(50), nullable=True)
    source_updated_at = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    ingredients_list = relationship("MedicationIngredient", secondary=medication_ingredient_map, backref="medications")


class UserMedication(Base):
    __tablename__ = "user_medication"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    medication_id = Column(BigInteger, ForeignKey("medication.id", ondelete="CASCADE"), nullable=False)
    is_current = Column(Boolean, nullable=True)
    started_at = Column(Date, nullable=True)
    expected_end_at = Column(Date, nullable=True)
    ended_at = Column(Date, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    medication = relationship("Medication")
