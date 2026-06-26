"""add ai score fields to skin_log

Revision ID: a8c4e2f9b1d0
Revises: 9a7f6d5c4b3a
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8c4e2f9b1d0"
down_revision: Union[str, Sequence[str], None] = "9a7f6d5c4b3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "skin_log",
        sa.Column("ai_overall_score", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_skin_log_ai_overall_score",
        "skin_log",
        "ai_overall_score IS NULL OR ai_overall_score BETWEEN 1 AND 5",
    )
    op.add_column(
        "skin_log",
        sa.Column("ai_score_version", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_skin_log_ai_overall_score",
        "skin_log",
        type_="check",
    )
    op.drop_column("skin_log", "ai_score_version")
    op.drop_column("skin_log", "ai_overall_score")
