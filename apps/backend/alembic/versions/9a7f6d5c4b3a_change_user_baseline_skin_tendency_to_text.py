"""change user_baseline skin_tendency to text

Revision ID: 9a7f6d5c4b3a
Revises: 02e44750b2b4
Create Date: 2026-06-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9a7f6d5c4b3a"
down_revision: Union[str, Sequence[str], None] = "02e44750b2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "user_baseline",
        "skin_tendency",
        existing_type=sa.String(length=20),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "user_baseline",
        "skin_tendency",
        existing_type=sa.Text(),
        type_=sa.String(length=20),
        existing_nullable=True,
    )
