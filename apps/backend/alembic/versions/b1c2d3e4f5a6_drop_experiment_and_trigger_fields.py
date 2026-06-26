"""drop user_experiment table and trigger/suspected_factors from analysis_request

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text, inspect

revision = 'b1c2d3e4f5a6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('user_experiment')
    op.drop_constraint('chk_trigger_type', 'analysis_request', type_='check')
    op.drop_column('analysis_request', 'trigger_type')
    # suspected_factors may or may not exist depending on migration order — drop only if present
    conn = op.get_bind()
    inspector = inspect(conn)
    cols = [c["name"] for c in inspector.get_columns("analysis_request")]
    if "suspected_factors" in cols:
        op.drop_column('analysis_request', 'suspected_factors')


def downgrade():
    op.add_column('analysis_request', sa.Column('trigger_type', sa.String(20), nullable=False, server_default='worse'))
    op.create_check_constraint('chk_trigger_type', 'analysis_request', "trigger_type IN ('worse','better')")
    op.create_table(
        'user_experiment',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('analysis_request_id', sa.BigInteger(), nullable=False),
        sa.Column('factor_type', sa.String(20), nullable=False),
        sa.Column('factor_key', sa.String(100), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('hypothesis', sa.Text(), nullable=False),
        sa.Column('evidence', sa.Text(), nullable=True),
        sa.Column('suggested_action', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='suggested'),
        sa.Column('evidence_level', sa.String(20), nullable=False, server_default='weak'),
        sa.Column('trigger_day', sa.Date(), nullable=False),
        sa.Column('lag_min_days', sa.Integer(), nullable=False),
        sa.Column('lag_max_days', sa.Integer(), nullable=False),
        sa.Column('confidence', sa.Numeric(3, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
