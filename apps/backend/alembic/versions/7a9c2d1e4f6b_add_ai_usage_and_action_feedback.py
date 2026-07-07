"""add ai usage and action feedback tables

Revision ID: 7a9c2d1e4f6b
Revises: d3e3027a0b1d
Create Date: 2026-07-07 10:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7a9c2d1e4f6b"
down_revision: Union[str, Sequence[str], None] = "d3e3027a0b1d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_log",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("feature", sa.String(length=50), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("input_units", sa.Integer(), nullable=False),
        sa.Column("output_units", sa.Integer(), nullable=False),
        sa.Column("estimated_cost_usd", sa.Numeric(10, 6), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_usage_log_id"), "ai_usage_log", ["id"], unique=False)
    op.create_index(op.f("ix_ai_usage_log_user_id"), "ai_usage_log", ["user_id"], unique=False)
    op.create_index(op.f("ix_ai_usage_log_feature"), "ai_usage_log", ["feature"], unique=False)

    op.create_table(
        "action_recommendation_feedback",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("analysis_request_id", sa.BigInteger(), nullable=False),
        sa.Column("action_key", sa.String(length=100), nullable=False),
        sa.Column("factor_key", sa.String(length=100), nullable=False),
        sa.Column("feedback", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("feedback IN ('done', 'skipped', 'not_helpful')", name="chk_action_feedback"),
        sa.ForeignKeyConstraint(["analysis_request_id"], ["analysis_request.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_action_recommendation_feedback_id"),
        "action_recommendation_feedback",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_action_recommendation_feedback_user_id"),
        "action_recommendation_feedback",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_action_recommendation_feedback_analysis_request_id"),
        "action_recommendation_feedback",
        ["analysis_request_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_action_recommendation_feedback_analysis_request_id"), table_name="action_recommendation_feedback")
    op.drop_index(op.f("ix_action_recommendation_feedback_user_id"), table_name="action_recommendation_feedback")
    op.drop_index(op.f("ix_action_recommendation_feedback_id"), table_name="action_recommendation_feedback")
    op.drop_table("action_recommendation_feedback")
    op.drop_index(op.f("ix_ai_usage_log_feature"), table_name="ai_usage_log")
    op.drop_index(op.f("ix_ai_usage_log_user_id"), table_name="ai_usage_log")
    op.drop_index(op.f("ix_ai_usage_log_id"), table_name="ai_usage_log")
    op.drop_table("ai_usage_log")
