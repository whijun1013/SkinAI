"""merge food seed and cosmetic rename chains

Revision ID: b950225865f7
Revises: 3f3f552a5810, f1c2d3e4a5b6
Create Date: 2026-06-02 16:55:37.487154

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b950225865f7'
down_revision: Union[str, Sequence[str], None] = ('3f3f552a5810', 'f1c2d3e4a5b6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
