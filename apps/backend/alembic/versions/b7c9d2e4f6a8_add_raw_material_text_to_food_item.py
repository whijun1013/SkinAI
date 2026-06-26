"""add raw material text to food_item

Revision ID: b7c9d2e4f6a8
Revises: ab22f27341fd
Create Date: 2026-06-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c9d2e4f6a8"
down_revision: Union[str, Sequence[str], None] = "ab22f27341fd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("food_item", sa.Column("raw_material_text", sa.Text(), nullable=True))
    op.add_column("food_item", sa.Column("allergen_text", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("food_item", "allergen_text")
    op.drop_column("food_item", "raw_material_text")
