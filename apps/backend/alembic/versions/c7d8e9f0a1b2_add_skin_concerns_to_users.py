"""add_skin_concerns_to_users

Revision ID: c7d8e9f0a1b2
Revises: 6459b3c3fe62
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, Sequence[str], None] = "6459b3c3fe62"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "skin_concerns" not in columns:
        op.add_column("users", sa.Column("skin_concerns", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "skin_concerns" in columns:
        op.drop_column("users", "skin_concerns")
