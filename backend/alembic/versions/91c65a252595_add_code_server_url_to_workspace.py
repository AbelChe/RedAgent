"""add_code_server_url_to_workspace

Revision ID: 91c65a252595
Revises: 35f2676da6ed
Create Date: 2026-01-15 22:08:41.193652

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '91c65a252595'
down_revision: Union[str, None] = '35f2676da6ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add code_server_url column to workspaces table
    op.add_column('workspaces', sa.Column('code_server_url', sa.String(), nullable=True, server_default='http://localhost:8080'))


def downgrade() -> None:
    # Remove code_server_url column from workspaces table
    op.drop_column('workspaces', 'code_server_url')

