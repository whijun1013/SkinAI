"""merge do/test and develop heads

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6, 6ac0047d9828
Create Date: 2026-06-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = ("e1f2a3b4c5d6", "6ac0047d9828")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
