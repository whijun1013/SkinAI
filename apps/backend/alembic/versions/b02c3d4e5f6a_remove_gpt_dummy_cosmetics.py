"""remove gpt dummy cosmetics

Revision ID: b02c3d4e5f6a
Revises: a01b2c3d4e5f
Create Date: 2026-06-22 23:05:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b02c3d4e5f6a'
down_revision: Union[str, Sequence[str], None] = 'a01b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
        DELETE uc FROM user_cosmetics uc
        JOIN cosmetic_products cp ON uc.product_id = cp.id
        WHERE cp.brand = 'GPT Dummy';
    """)
    op.execute("""
        DELETE cim FROM cosmetic_ingredient_map cim
        JOIN cosmetic_products cp ON cim.product_id = cp.id
        WHERE cp.brand = 'GPT Dummy';
    """)
    op.execute("DELETE FROM cosmetic_products WHERE brand = 'GPT Dummy';")


def downgrade() -> None:
    """Downgrade schema."""
    pass
