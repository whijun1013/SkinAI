"""add notification tables

Revision ID: d9f2e7a6c1b4
Revises: 82ce85a3c2b1
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d9f2e7a6c1b4"
down_revision: Union[str, Sequence[str], None] = "82ce85a3c2b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("skin_reminder_enabled", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("skin_reminder_time", sa.Time(), nullable=True),
        sa.Column("skin_reminder_days", sa.JSON(), nullable=True),
        sa.Column("daily_log_reminder_enabled", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("daily_log_reminder_time", sa.Time(), nullable=True),
        sa.Column("analysis_ready_enabled", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("analysis_complete_enabled", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("inactive_reminder_enabled", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("inactive_days_threshold", sa.Integer(), server_default=sa.text("3"), nullable=False),
        sa.Column("timezone", sa.String(length=50), server_default=sa.text("'Asia/Seoul'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_notification_settings_user_id"),
        "notification_settings",
        ["user_id"],
        unique=True,
    )

    op.create_table(
        "notification_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expo_push_token", sa.String(length=255), nullable=False),
        sa.Column("device_id", sa.String(length=255), nullable=True),
        sa.Column("platform", sa.String(length=30), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_notification_tokens_expo_push_token"),
        "notification_tokens",
        ["expo_push_token"],
        unique=True,
    )
    op.create_index(
        op.f("ix_notification_tokens_user_id"),
        "notification_tokens",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_notification_tokens_user_id"), table_name="notification_tokens")
    op.drop_index(op.f("ix_notification_tokens_expo_push_token"), table_name="notification_tokens")
    op.drop_table("notification_tokens")
    op.drop_index(op.f("ix_notification_settings_user_id"), table_name="notification_settings")
    op.drop_table("notification_settings")
