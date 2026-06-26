"""add_diet_log_id_to_environment_log

Revision ID: b4b931249f56
Revises: 673e01960af2
Create Date: 2026-05-28 15:17:38.599540

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4b931249f56'
down_revision: Union[str, Sequence[str], None] = '673e01960af2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('environment_log', sa.Column('diet_log_id', sa.BigInteger(), nullable=True))
    op.create_index('ix_environment_log_diet_log_id', 'environment_log', ['diet_log_id'], unique=False)
    op.create_foreign_key(
        'fk_environment_log_diet_log',
        'environment_log',
        'diet_log',
        ['diet_log_id'],
        ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_environment_log_diet_log', 'environment_log', type_='foreignkey')
    op.drop_index('ix_environment_log_diet_log_id', table_name='environment_log')
    op.drop_column('environment_log', 'diet_log_id')

