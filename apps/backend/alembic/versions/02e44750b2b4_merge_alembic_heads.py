"""merge alembic heads

Revision ID: 02e44750b2b4
Revises: f392c905ca78, 4e5cbc0332ec
Create Date: 2026-06-08 22:47:23.947962

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '02e44750b2b4'
down_revision: Union[str, Sequence[str], None] = ('f392c905ca78', '4e5cbc0332ec')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
