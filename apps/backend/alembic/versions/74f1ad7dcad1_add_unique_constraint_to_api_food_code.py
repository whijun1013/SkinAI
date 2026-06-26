"""add unique constraint to api_food_code

Revision ID: 74f1ad7dcad1
Revises: b950225865f7
Create Date: 2026-06-02 16:57:23.913413

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '74f1ad7dcad1'
down_revision: Union[str, Sequence[str], None] = 'b950225865f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        UPDATE food_item f
        JOIN (
            SELECT api_food_code, MIN(id) AS keep_id
            FROM food_item
            WHERE api_food_code IS NOT NULL AND api_food_code != ''
            GROUP BY api_food_code
            HAVING COUNT(*) > 1
        ) d ON f.api_food_code = d.api_food_code AND f.id != d.keep_id
        SET f.api_food_code = NULL
        """
    )
    op.drop_index(op.f('ix_food_item_api_food_code'), table_name='food_item')
    op.create_index(op.f('ix_food_item_api_food_code'), 'food_item', ['api_food_code'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_food_item_api_food_code'), table_name='food_item')
    op.create_index(op.f('ix_food_item_api_food_code'), 'food_item', ['api_food_code'], unique=False)
