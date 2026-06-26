"""add unique constraint user_id logged_at to skin_log

Revision ID: 66e7bdfba321
Revises: 90be36cc9d74
Create Date: 2026-06-22 11:01:04.228088

"""
from typing import Sequence, Union

from alembic import op


revision: str = '66e7bdfba321'
down_revision: Union[str, Sequence[str], None] = '90be36cc9d74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint('uq_skin_log_user_date', 'skin_log', ['user_id', 'logged_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uq_skin_log_user_date', 'skin_log', type_='unique')
