"""Add quality check fields to SkinLog

Revision ID: a1b2c3d4e5g7
Revises: 82ce85a3c2b1
Create Date: 2026-06-12 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5g7'
down_revision = '82ce85a3c2b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('skin_log', sa.Column('quality_check_passed', sa.Boolean(), nullable=True))
    op.add_column('skin_log', sa.Column('quality_warning', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('skin_log', 'quality_warning')
    op.drop_column('skin_log', 'quality_check_passed')
