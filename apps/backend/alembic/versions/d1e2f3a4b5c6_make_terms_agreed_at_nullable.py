"""make terms_agreed_at nullable

Revision ID: d1e2f3a4b5c6
Revises: c4d8e1f2a3b5
Create Date: 2026-06-15 05:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c4d8e1f2a3b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "terms_agreed_at",
        existing_type=sa.DateTime(),
        nullable=True,
    )


def downgrade() -> None:
    # NULL 행을 현재 시각으로 채운 뒤 NOT NULL 복원
    op.execute(
        "UPDATE users SET terms_agreed_at = NOW() WHERE terms_agreed_at IS NULL"
    )
    op.alter_column(
        "users",
        "terms_agreed_at",
        existing_type=sa.DateTime(),
        nullable=False,
    )
