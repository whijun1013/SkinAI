"""rename product_ingredient to cosmetic_ingredient_map

Revision ID: f1c2d3e4a5b6
Revises: e8f4a72d6c91
Create Date: 2026-06-01

"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "f1c2d3e4a5b6"
down_revision: Union[str, Sequence[str], None] = "e8f4a72d6c91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    table_names = inspect(op.get_bind()).get_table_names()
    if "product_ingredient" in table_names and "cosmetic_ingredient_map" not in table_names:
        op.rename_table("product_ingredient", "cosmetic_ingredient_map")


def downgrade() -> None:
    table_names = inspect(op.get_bind()).get_table_names()
    if "cosmetic_ingredient_map" in table_names and "product_ingredient" not in table_names:
        op.rename_table("cosmetic_ingredient_map", "product_ingredient")
