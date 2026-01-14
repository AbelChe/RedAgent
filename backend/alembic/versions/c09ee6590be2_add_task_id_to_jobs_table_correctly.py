"""add_task_id_to_jobs_table_correctly

Revision ID: c09ee6590be2
Revises: f1f0c2b35c52
Create Date: 2025-12-30 11:54:40.295864

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c09ee6590be2'
down_revision: Union[str, None] = 'f1f0c2b35c52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add task_id column to jobs table
    op.add_column('jobs', sa.Column('task_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_jobs_task_id'), 'jobs', ['task_id'], unique=False)
    op.create_foreign_key(None, 'jobs', 'tasks', ['task_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    # Remove task_id from jobs table
    op.drop_constraint(None, 'jobs', type_='foreignkey')
    op.drop_index(op.f('ix_jobs_task_id'), table_name='jobs')
    op.drop_column('jobs', 'task_id')
