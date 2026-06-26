"""remove cosmetic duplicates

Revision ID: a01b2c3d4e5f
Revises: 66e7bdfba321
Create Date: 2026-06-22 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a01b2c3d4e5f'
down_revision: Union[str, Sequence[str], None] = '66e7bdfba321'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update user_cosmetics to point to the min_id
    op.execute("""
        UPDATE user_cosmetics uc
        JOIN cosmetic_products cp ON uc.product_id = cp.id
        JOIN (
            SELECT brand, product_name, MIN(id) as min_id
            FROM cosmetic_products
            GROUP BY brand, product_name
        ) min_cp ON cp.brand = min_cp.brand AND cp.product_name = min_cp.product_name
        LEFT JOIN (
            SELECT user_id, product_id FROM user_cosmetics
        ) uc2 ON uc2.user_id = uc.user_id AND uc2.product_id = min_cp.min_id
        SET uc.product_id = min_cp.min_id
        WHERE cp.id != min_cp.min_id
        AND uc2.user_id IS NULL;
    """)

    # 2. Delete remaining duplicate user_cosmetics
    op.execute("""
        DELETE uc FROM user_cosmetics uc
        JOIN cosmetic_products cp ON uc.product_id = cp.id
        JOIN (
            SELECT brand, product_name, MIN(id) as min_id
            FROM cosmetic_products
            GROUP BY brand, product_name
        ) min_cp ON cp.brand = min_cp.brand AND cp.product_name = min_cp.product_name
        WHERE cp.id != min_cp.min_id;
    """)

    # 3. Preserve ingredient mappings from duplicate rows on the kept product.
    op.execute("""
        INSERT IGNORE INTO cosmetic_ingredient_map (product_id, ingredient_id)
        SELECT min_cp.min_id, cim.ingredient_id
        FROM cosmetic_ingredient_map cim
        JOIN cosmetic_products cp ON cim.product_id = cp.id
        JOIN (
            SELECT brand, product_name, MIN(id) as min_id
            FROM cosmetic_products
            GROUP BY brand, product_name
        ) min_cp ON cp.brand = min_cp.brand AND cp.product_name = min_cp.product_name
        WHERE cp.id != min_cp.min_id;
    """)

    # 4. Delete from cosmetic_ingredient_map for duplicates
    op.execute("""
        DELETE cim FROM cosmetic_ingredient_map cim
        JOIN cosmetic_products cp ON cim.product_id = cp.id
        JOIN (
            SELECT brand, product_name, MIN(id) as min_id
            FROM cosmetic_products
            GROUP BY brand, product_name
        ) min_cp ON cp.brand = min_cp.brand AND cp.product_name = min_cp.product_name
        WHERE cp.id != min_cp.min_id;
    """)

    # 5. Delete the duplicate cosmetic_products
    op.execute("""
        DELETE cp FROM cosmetic_products cp
        JOIN (
            SELECT brand, product_name, MIN(id) as min_id
            FROM cosmetic_products
            GROUP BY brand, product_name
        ) min_cp ON cp.brand = min_cp.brand AND cp.product_name = min_cp.product_name
        WHERE cp.id != min_cp.min_id;
    """)

    # 6. Delete placeholders and local dummy scenario products from master data.
    op.execute("""
        DELETE uc FROM user_cosmetics uc
        JOIN cosmetic_products cp ON uc.product_id = cp.id
        WHERE cp.product_name IN ('상품명', '가품 피해 방지 안내')
           OR cp.brand = 'GPT Dummy';
    """)
    op.execute("""
        DELETE cim FROM cosmetic_ingredient_map cim
        JOIN cosmetic_products cp ON cim.product_id = cp.id
        WHERE cp.product_name IN ('상품명', '가품 피해 방지 안내')
           OR cp.brand = 'GPT Dummy';
    """)
    op.execute("""
        DELETE FROM cosmetic_products
        WHERE product_name IN ('상품명', '가품 피해 방지 안내')
           OR brand = 'GPT Dummy';
    """)

    # 7. Add unique constraint
    op.create_unique_constraint('uq_cosmetic_brand_name', 'cosmetic_products', ['brand', 'product_name'])


def downgrade() -> None:
    op.drop_constraint('uq_cosmetic_brand_name', 'cosmetic_products', type_='unique')
