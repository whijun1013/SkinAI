"""merge_chatbot_and_develop

Revision ID: 3d618b5d5fce
Revises: 8f2b7c9d1e4a, 9fe4e1a70760
Create Date: 2026-06-15 17:37:19.358205

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3d618b5d5fce'
down_revision: Union[str, Sequence[str], None] = ('8f2b7c9d1e4a', '9fe4e1a70760')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
