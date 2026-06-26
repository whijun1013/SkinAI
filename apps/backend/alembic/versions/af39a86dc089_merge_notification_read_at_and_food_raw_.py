"""merge notification read_at and food raw material heads

Revision ID: af39a86dc089
Revises: b7c8d9e0f1a2, b7c9d2e4f6a8
Create Date: 2026-06-17 17:01:42.871604

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af39a86dc089'
down_revision: Union[str, Sequence[str], None] = ('b7c8d9e0f1a2', 'b7c9d2e4f6a8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
