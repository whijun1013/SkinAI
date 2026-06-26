"""merge notification and chatbot heads

Revision ID: 6459b3c3fe62
Revises: 3d618b5d5fce, e2f3a4b5c6d7
Create Date: 2026-06-15 18:02:30.825552

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6459b3c3fe62'
down_revision: Union[str, Sequence[str], None] = ('3d618b5d5fce', 'e2f3a4b5c6d7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
