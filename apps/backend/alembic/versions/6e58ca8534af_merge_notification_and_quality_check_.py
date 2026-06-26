"""merge notification and quality check heads

Revision ID: 6e58ca8534af
Revises: d9f2e7a6c1b4, a1b2c3d4e5g7
Create Date: 2026-06-15 00:02:43.656219

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e58ca8534af'
down_revision: Union[str, Sequence[str], None] = ('d9f2e7a6c1b4', 'a1b2c3d4e5g7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
