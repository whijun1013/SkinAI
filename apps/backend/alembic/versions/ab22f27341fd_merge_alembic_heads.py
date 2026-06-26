"""merge alembic heads

Revision ID: ab22f27341fd
Revises: a142ac2ce43f, f4a5b6c7d8e9
Create Date: 2026-06-16 20:22:57.205038

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab22f27341fd'
down_revision: Union[str, Sequence[str], None] = ('a142ac2ce43f', 'f4a5b6c7d8e9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
