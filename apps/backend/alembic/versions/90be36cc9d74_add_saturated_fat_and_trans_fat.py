"""add_saturated_fat_and_trans_fat

Revision ID: 90be36cc9d74
Revises: 2ea7fcf67853
Create Date: 2026-06-19 22:02:38.640354

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '90be36cc9d74'
down_revision: Union[str, Sequence[str], None] = '2ea7fcf67853'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('food_item', sa.Column('saturated_fat', sa.Numeric(precision=8, scale=2), nullable=True))
    op.add_column('food_item', sa.Column('trans_fat', sa.Numeric(precision=8, scale=2), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('food_item', 'trans_fat')
    op.drop_column('food_item', 'saturated_fat')
