"""initial schema - final ERD v5

Revision ID: 673e01960af2
Revises: 
Create Date: 2026-05-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '673e01960af2'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('hashed_password', sa.String(60), nullable=False),
        sa.Column('skin_type', sa.String(20), nullable=True),
        sa.Column('birth_year', sa.SmallInteger(), nullable=True),
        sa.Column('gender', sa.String(10), nullable=True),
        sa.Column('is_onboarded', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('terms_agreed_at', sa.DateTime(), nullable=False),
        sa.Column('push_token', sa.String(200), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email', name='ix_users_email'),
        sa.CheckConstraint("skin_type IN ('건성','지성','복합성','민감성','중성')", name='chk_skin_type'),
        sa.CheckConstraint("gender IN ('남','여')", name='chk_gender'),
    )
    op.create_index('ix_users_id', 'users', ['id'], unique=False)

    op.create_table('social_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('provider_user_id', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('provider', 'provider_user_id', name='uq_social_accounts_provider_user_id'),
    )
    op.create_index('ix_social_accounts_id', 'social_accounts', ['id'], unique=False)
    op.create_index('ix_social_accounts_user_id', 'social_accounts', ['user_id'], unique=False)

    op.create_table('user_location',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('location_type', sa.String(10), nullable=False),
        sa.Column('location_name', sa.String(100), nullable=True),
        sa.Column('lat', sa.Numeric(9, 6), nullable=False),
        sa.Column('lng', sa.Numeric(9, 6), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("location_type IN ('home','work')", name='chk_location_type'),
    )
    op.create_index('ix_user_location_user_id', 'user_location', ['user_id'], unique=False)

    op.create_table('cosmetic_ingredients',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('english_name', sa.Text(), nullable=True),
        sa.Column('cas_no', sa.String(100), nullable=True),
        sa.Column('origin', sa.Text(), nullable=True),
        sa.Column('is_irritant', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('is_banned', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('restriction_limit', sa.String(255), nullable=True),
        sa.Column('comedogenic', mysql.TINYINT(), nullable=True),
        sa.Column('comedogenic_source', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='ix_cosmetic_ingredients_name'),
    )
    op.create_index('ix_cosmetic_ingredients_id', 'cosmetic_ingredients', ['id'], unique=False)

    op.create_table('cosmetic_products',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('brand', sa.String(100), nullable=False),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('ingredients', sa.Text(length=16777215), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('image_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cosmetic_products_id', 'cosmetic_products', ['id'], unique=False)
    op.create_index('ix_cosmetic_products_brand', 'cosmetic_products', ['brand'], unique=False)
    op.create_index('ix_cosmetic_products_product_name', 'cosmetic_products', ['product_name'], unique=False)

    op.create_table('cosmetic_ingredient_map',
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('ingredient_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['ingredient_id'], ['cosmetic_ingredients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['cosmetic_products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('product_id', 'ingredient_id'),
    )

    op.create_table('user_cosmetics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('is_current', sa.Boolean(), nullable=True),
        sa.Column('started_at', sa.Date(), nullable=True),
        sa.Column('ended_at', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['product_id'], ['cosmetic_products.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_cosmetics_id', 'user_cosmetics', ['id'], unique=False)

    op.create_table('medication_ingredient',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('drug_class', sa.String(100), nullable=True),
        sa.Column('is_skin_relevant', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='ix_medication_ingredient_name'),
    )
    op.create_index('ix_medication_ingredient_id', 'medication_ingredient', ['id'], unique=False)

    op.create_table('medication',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('form', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_medication_id', 'medication', ['id'], unique=False)
    op.create_index('ix_medication_name', 'medication', ['name'], unique=False)

    op.create_table('medication_ingredient_map',
        sa.Column('medication_id', sa.BigInteger(), nullable=False),
        sa.Column('ingredient_id', sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(['ingredient_id'], ['medication_ingredient.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['medication_id'], ['medication.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('medication_id', 'ingredient_id'),
    )

    op.create_table('user_medication',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('medication_id', sa.BigInteger(), nullable=False),
        sa.Column('is_current', sa.Boolean(), nullable=True),
        sa.Column('started_at', sa.Date(), nullable=True),
        sa.Column('expected_end_at', sa.Date(), nullable=True),
        sa.Column('ended_at', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['medication_id'], ['medication.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_medication_id', 'user_medication', ['id'], unique=False)

    op.create_table('skin_log',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('logged_at', sa.Date(), nullable=False),
        sa.Column('photo_url', sa.String(500), nullable=True),
        sa.Column('condition_tags', sa.JSON(), nullable=True),
        sa.Column('overall_score', mysql.TINYINT(), nullable=True),
        sa.Column('skin_summary', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("overall_score BETWEEN 1 AND 5", name='chk_overall_score'),
    )
    op.create_index('ix_skin_log_user_id', 'skin_log', ['user_id'], unique=False)
    op.create_index('ix_skin_log_logged_at', 'skin_log', ['logged_at'], unique=False)

    op.create_table('food_item',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('api_food_code', sa.String(100), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('calories', sa.Numeric(8, 2), nullable=True),
        sa.Column('carbohydrate', sa.Numeric(8, 2), nullable=True),
        sa.Column('sugar', sa.Numeric(8, 2), nullable=True),
        sa.Column('protein', sa.Numeric(8, 2), nullable=True),
        sa.Column('fat', sa.Numeric(8, 2), nullable=True),
        sa.Column('sodium', sa.Numeric(8, 2), nullable=True),
        sa.Column('is_dairy', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('is_high_gi', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_food_item_name', 'food_item', ['name'], unique=False)
    op.create_index('ix_food_item_api_food_code', 'food_item', ['api_food_code'], unique=False)

    op.create_table('diet_log',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('logged_at', sa.DateTime(), nullable=False),
        sa.Column('meal_type', sa.String(20), nullable=True),
        sa.Column('input_method', sa.String(20), nullable=True),
        sa.Column('photo_url', sa.String(500), nullable=True),
        sa.Column('captured_lat', sa.Numeric(9, 6), nullable=True),
        sa.Column('captured_lng', sa.Numeric(9, 6), nullable=True),
        sa.Column('captured_location_name', sa.String(100), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("meal_type IN ('아침','점심','저녁','간식')", name='chk_meal_type'),
        sa.CheckConstraint("input_method IN ('photo','manual')", name='chk_input_method'),
    )
    op.create_index('ix_diet_log_user_id', 'diet_log', ['user_id'], unique=False)
    op.create_index('ix_diet_log_logged_at', 'diet_log', ['logged_at'], unique=False)

    op.create_table('diet_log_item',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('diet_log_id', sa.BigInteger(), nullable=False),
        sa.Column('food_item_id', sa.BigInteger(), nullable=True),
        sa.Column('custom_food_name', sa.String(255), nullable=True),
        sa.Column('amount', sa.Numeric(8, 2), nullable=True),
        sa.Column('unit', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['diet_log_id'], ['diet_log.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['food_item_id'], ['food_item.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_diet_log_item_diet_log_id', 'diet_log_item', ['diet_log_id'], unique=False)

    op.create_table('environment_log',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('logged_at', sa.Date(), nullable=False),
        sa.Column('lat', sa.Numeric(9, 6), nullable=True),
        sa.Column('lng', sa.Numeric(9, 6), nullable=True),
        sa.Column('location_name', sa.String(100), nullable=True),
        sa.Column('temperature', sa.Numeric(5, 2), nullable=True),
        sa.Column('humidity', mysql.TINYINT(), nullable=True),
        sa.Column('pm10', sa.SmallInteger(), nullable=True),
        sa.Column('pm25', sa.SmallInteger(), nullable=True),
        sa.Column('uv_index', mysql.TINYINT(), nullable=True),
        sa.Column('weather', sa.String(50), nullable=True),
        sa.Column('source', sa.String(20), nullable=False),
        sa.Column('captured_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("source IN ('app_camera','exif','manual','retroactive')", name='chk_source'),
    )
    op.create_index('ix_environment_log_user_id', 'environment_log', ['user_id'], unique=False)
    op.create_index('ix_environment_log_logged_at', 'environment_log', ['logged_at'], unique=False)

    op.create_table('daily_behavior_log',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('logged_at', sa.Date(), nullable=False),
        sa.Column('sleep_hours', sa.Numeric(3, 1), nullable=True),
        sa.Column('sleep_quality', mysql.TINYINT(), nullable=True),
        sa.Column('stress_level', mysql.TINYINT(), nullable=True),
        sa.Column('water_intake_ml', sa.SmallInteger(), nullable=True),
        sa.Column('exercise_yn', sa.Boolean(), nullable=True),
        sa.Column('exercise_type', sa.String(50), nullable=True),
        sa.Column('exercise_duration_min', sa.SmallInteger(), nullable=True),
        sa.Column('alcohol_yn', sa.Boolean(), nullable=True),
        sa.Column('smoking_yn', sa.Boolean(), nullable=True),
        sa.Column('custom_behaviors', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("sleep_quality BETWEEN 1 AND 5", name='chk_sleep_quality'),
        sa.CheckConstraint("stress_level BETWEEN 1 AND 5", name='chk_stress_level'),
    )
    op.create_index('ix_daily_behavior_log_user_id', 'daily_behavior_log', ['user_id'], unique=False)
    op.create_index('ix_daily_behavior_log_logged_at', 'daily_behavior_log', ['logged_at'], unique=False)

    op.create_table('analysis_request',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('skin_log_id', sa.BigInteger(), nullable=False),
        sa.Column('requested_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('lookback_days', mysql.TINYINT(), nullable=False, server_default='14'),
        sa.Column('trigger_type', sa.String(20), nullable=False, server_default='worse'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['skin_log_id'], ['skin_log.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("status IN ('pending','processing','done','failed')", name='chk_status'),
        sa.CheckConstraint("trigger_type IN ('worse','better')", name='chk_trigger_type'),
    )
    op.create_index('ix_analysis_request_user_id', 'analysis_request', ['user_id'], unique=False)
    op.create_index('ix_analysis_request_skin_log_id', 'analysis_request', ['skin_log_id'], unique=False)

    op.create_table('agent_result',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('request_id', sa.BigInteger(), nullable=False),
        sa.Column('agent_type', sa.String(20), nullable=False),
        sa.Column('suspicious_items', sa.JSON(), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Numeric(3, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['request_id'], ['analysis_request.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("agent_type IN ('cosmetic','medication','diet','environment','behavior')", name='chk_agent_type'),
    )
    op.create_index('ix_agent_result_request_id', 'agent_result', ['request_id'], unique=False)

    op.create_table('analysis_result',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('request_id', sa.BigInteger(), nullable=False),
        sa.Column('primary_cause', sa.Text(), nullable=True),
        sa.Column('contributing_factors', sa.JSON(), nullable=True),
        sa.Column('report_text', sa.Text(), nullable=True),
        sa.Column('confidence_score', sa.Numeric(3, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['request_id'], ['analysis_request.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id', name='uq_analysis_result_request_id'),
    )

    op.create_table('user_baseline',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('skin_tendency', sa.String(20), nullable=True),
        sa.Column('avg_reaction_delay', mysql.TINYINT(), nullable=True),
        sa.Column('analysis_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_calibrated_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_user_baseline_user_id'),
    )

    op.create_table('user_factor_sensitivity',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('factor_type', sa.String(20), nullable=False),
        sa.Column('factor_key', sa.String(255), nullable=False),
        sa.Column('sensitivity_score', sa.Numeric(3, 2), nullable=False, server_default='0.00'),
        sa.Column('trigger_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_triggered_at', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'factor_type', 'factor_key', name='uq_user_factor'),
        sa.CheckConstraint("factor_type IN ('ingredient','food','environment','medication','behavior')", name='chk_factor_type'),
    )
    op.create_index('ix_user_factor_sensitivity_user_id', 'user_factor_sensitivity', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('user_factor_sensitivity')
    op.drop_table('user_baseline')
    op.drop_table('analysis_result')
    op.drop_table('agent_result')
    op.drop_table('analysis_request')
    op.drop_table('daily_behavior_log')
    op.drop_table('environment_log')
    op.drop_table('diet_log_item')
    op.drop_table('diet_log')
    op.drop_table('food_item')
    op.drop_table('skin_log')
    op.drop_table('user_medication')
    op.drop_table('medication_ingredient_map')
    op.drop_table('medication')
    op.drop_table('medication_ingredient')
    op.drop_table('user_cosmetics')
    op.drop_table('cosmetic_ingredient_map')
    op.drop_table('cosmetic_products')
    op.drop_table('cosmetic_ingredients')
    op.drop_table('user_location')
    op.drop_table('social_accounts')
    op.drop_table('users')
