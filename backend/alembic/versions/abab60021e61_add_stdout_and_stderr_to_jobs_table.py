"""Add stdout and stderr to jobs table

Revision ID: abab60021e61
Revises: 5327c7c62100
Create Date: 2025-12-29 11:23:32.469100

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'abab60021e61'
down_revision: Union[str, None] = '5327c7c62100'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if jobs table exists, if not create it with all columns including stdout/stderr
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'jobs' not in inspector.get_table_names():
        # Table doesn't exist, create it with all columns
        op.create_table(
            'jobs',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('command', sa.Text(), nullable=False),
            sa.Column('status', postgresql.ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', name='jobstatus', create_type=False), nullable=False),
            sa.Column('priority', sa.Integer(), nullable=True),
            sa.Column('user_id', sa.String(), nullable=True),
            sa.Column('workspace_id', sa.String(), nullable=False),
            sa.Column('celery_task_id', sa.String(), nullable=True),
            sa.Column('agent_id', sa.String(), nullable=True),
            sa.Column('exit_code', sa.Integer(), nullable=True),
            sa.Column('stdout', sa.Text(), nullable=True),
            sa.Column('stderr', sa.Text(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('idx_created_at'), 'jobs', ['created_at'], unique=False)
        op.create_index(op.f('idx_workspace_status'), 'jobs', ['workspace_id', 'status'], unique=False)
    else:
        # Table exists, add stdout and stderr columns if they don't exist
        columns = [col['name'] for col in inspector.get_columns('jobs')]
        if 'stdout' not in columns:
            op.add_column('jobs', sa.Column('stdout', sa.Text(), nullable=True))
        if 'stderr' not in columns:
            op.add_column('jobs', sa.Column('stderr', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove stdout and stderr columns from jobs table
    op.drop_column('jobs', 'stderr')
    op.drop_column('jobs', 'stdout')
