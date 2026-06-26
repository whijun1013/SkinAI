"""merge develop heads

Revision ID: 019743c3c1ed
Revises: 140a17f27930, a8c4e2f9b1d0
Create Date: 2026-06-11 13:08:36.470200

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '019743c3c1ed'
down_revision: Union[str, Sequence[str], None] = ('140a17f27930', 'a8c4e2f9b1d0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
