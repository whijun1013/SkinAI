"""add user experiment table

Revision ID: 8f2b7c9d1e4a
Revises: d1e2f3a4b5c6
Create Date: 2026-06-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8f2b7c9d1e4a"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_experiment",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("analysis_request_id", sa.BigInteger(), nullable=False),
        sa.Column("factor_type", sa.String(length=20), nullable=False),
        sa.Column("factor_key", sa.String(length=100), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("hypothesis", sa.Text(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("suggested_action", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="suggested"),
        sa.Column("evidence_level", sa.String(length=20), nullable=False, server_default="weak"),
        sa.Column("trigger_day", sa.Date(), nullable=False),
        sa.Column("lag_min_days", sa.Integer(), nullable=False),
        sa.Column("lag_max_days", sa.Integer(), nullable=False),
        sa.Column("baseline_window_start", sa.Date(), nullable=True),
        sa.Column("baseline_window_end", sa.Date(), nullable=True),
        sa.Column("verification_window_start", sa.Date(), nullable=True),
        sa.Column("verification_window_end", sa.Date(), nullable=True),
        sa.Column("target_metric", sa.String(length=30), nullable=False, server_default="overall_score"),
        sa.Column("baseline_avg_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("verification_avg_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("delta_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("adherence_rate", sa.Numeric(3, 2), nullable=True),
        sa.Column("result", sa.String(length=20), nullable=True),
        sa.Column("confidence", sa.Numeric(3, 2), nullable=True),
        sa.Column("confounder_notes", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "factor_type IN ('food','behavior')",
            name="chk_user_experiment_factor_type",
        ),
        sa.CheckConstraint(
            "status IN ('suggested','accepted','active','completed','dismissed','expired')",
            name="chk_user_experiment_status",
        ),
        sa.CheckConstraint(
            "evidence_level IN ('weak','moderate','strong')",
            name="chk_user_experiment_evidence_level",
        ),
        sa.CheckConstraint(
            "result IS NULL OR result IN ('improved','unchanged','worsened','inconclusive')",
            name="chk_user_experiment_result",
        ),
        sa.CheckConstraint(
            "lag_min_days >= 0 AND lag_max_days >= lag_min_days",
            name="chk_user_experiment_lag_window",
        ),
        sa.CheckConstraint(
            "adherence_rate IS NULL OR adherence_rate BETWEEN 0 AND 1",
            name="chk_user_experiment_adherence_rate",
        ),
        sa.CheckConstraint(
            "confidence IS NULL OR confidence BETWEEN 0 AND 1",
            name="chk_user_experiment_confidence",
        ),
        sa.ForeignKeyConstraint(["analysis_request_id"], ["analysis_request.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_experiment_id"), "user_experiment", ["id"], unique=False)
    op.create_index(op.f("ix_user_experiment_user_id"), "user_experiment", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_user_experiment_analysis_request_id"),
        "user_experiment",
        ["analysis_request_id"],
        unique=False,
    )
    op.create_index(op.f("ix_user_experiment_status"), "user_experiment", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_experiment_status"), table_name="user_experiment")
    op.drop_index(op.f("ix_user_experiment_analysis_request_id"), table_name="user_experiment")
    op.drop_index(op.f("ix_user_experiment_user_id"), table_name="user_experiment")
    op.drop_index(op.f("ix_user_experiment_id"), table_name="user_experiment")
    op.drop_table("user_experiment")
