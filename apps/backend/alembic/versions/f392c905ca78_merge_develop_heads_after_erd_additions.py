"""merge develop heads after erd additions

Revision ID: f392c905ca78
Revises: 73d66c3f8679, a1b2c3d4e5f6
Create Date: 2026-06-04 17:54:52.384229

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f392c905ca78'
down_revision: Union[str, Sequence[str], None] = ('73d66c3f8679', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
