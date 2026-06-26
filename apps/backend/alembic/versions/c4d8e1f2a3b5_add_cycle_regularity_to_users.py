"""add cycle_regularity to users

Revision ID: c4d8e1f2a3b5
Revises: 6e58ca8534af
Create Date: 2026-06-15 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d8e1f2a3b5"
down_revision: Union[str, Sequence[str], None] = "6e58ca8534af"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("cycle_regularity", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "cycle_regularity")
