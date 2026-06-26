"""drop skin_summary from skin_log

Revision ID: e8f4a72d6c91
Revises: b4b931249f56
Create Date: 2026-06-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8f4a72d6c91"
down_revision: Union[str, Sequence[str], None] = "b4b931249f56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("skin_log", "skin_summary")


def downgrade() -> None:
    op.add_column("skin_log", sa.Column("skin_summary", sa.Text(), nullable=True))
