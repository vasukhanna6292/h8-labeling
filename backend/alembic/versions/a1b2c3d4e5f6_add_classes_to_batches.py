"""add classes to batches

Revision ID: a1b2c3d4e5f6
Revises: 05546f215952
Create Date: 2026-04-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '05546f215952'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('batches', sa.Column('classes', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('batches', 'classes')
