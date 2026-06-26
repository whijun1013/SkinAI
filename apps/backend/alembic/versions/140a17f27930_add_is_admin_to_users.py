"""Add is_admin to users

Revision ID: 140a17f27930
Revises: 9a7f6d5c4b3a
Create Date: 2026-06-11 10:31:41.596459

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '140a17f27930'
down_revision: Union[str, Sequence[str], None] = '9a7f6d5c4b3a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 컬럼 추가 (server_default로 기존 데이터에 False 적용)
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.text('0')))
    # 2. 런타임 모델과 동일하게 DB 레벨 기본값 제거 (선택적이나, SQLAlchemy 모델과 동작 일치를 위함)
    op.alter_column('users', 'is_admin', server_default=None, existing_type=sa.Boolean(), existing_nullable=False)


def downgrade() -> None:
    op.drop_column('users', 'is_admin')
