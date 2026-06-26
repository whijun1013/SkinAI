"""preserve current chain marker

Revision ID: 73d66c3f8679
Revises: 74f1ad7dcad1
Create Date: 2026-06-02 17:54:16.124149

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73d66c3f8679'
down_revision: Union[str, Sequence[str], None] = '74f1ad7dcad1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
