"""merge heads and add discovered_patterns to analysis_result

Revision ID: e1f2a3b4c5d6
Revises: b1c2d3e4f5a6, c2402749c6ce
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = ("b1c2d3e4f5a6", "c2402749c6ce")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("analysis_result", sa.Column("discovered_patterns", sa.JSON(), nullable=True))
    op.drop_constraint('ck_skin_log_ai_overall_score', 'skin_log', type_='check')
    op.drop_column('skin_log', 'ai_overall_score')
    op.drop_column('skin_log', 'ai_score_version')
    # suspected_factors: drop only if still present (b1c2d3e4f5a6 may have already dropped it)
    conn = op.get_bind()
    inspector = inspect(conn)
    cols = [c["name"] for c in inspector.get_columns("analysis_request")]
    if "suspected_factors" in cols:
        op.drop_column('analysis_request', 'suspected_factors')


def downgrade() -> None:
    op.add_column('analysis_request', sa.Column('suspected_factors', sa.JSON(), nullable=True))
    op.drop_column("analysis_result", "discovered_patterns")
    op.add_column('skin_log', sa.Column('ai_score_version', sa.String(50), nullable=True))
    op.add_column('skin_log', sa.Column('ai_overall_score', sa.Integer(), nullable=True))
    op.create_check_constraint(
        'ck_skin_log_ai_overall_score',
        'skin_log',
        'ai_overall_score IS NULL OR ai_overall_score BETWEEN 1 AND 5',
    )
