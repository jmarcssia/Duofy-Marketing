"""Datas avançadas do ciclo editorial no evento do calendário (5d).

Revision ID: 0027_calendar_event_dates
Revises: 0026_output_briefing_json
Create Date: 2026-07-06
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0027_calendar_event_dates"
down_revision: str | None = "0026_output_briefing_json"
branch_labels = None
depends_on = None

_DATE_COLS = ("delivery_at", "review_at", "approval_at", "due_at", "reminder_at")


def upgrade() -> None:
    for col in _DATE_COLS:
        op.add_column(
            "calendar_events", sa.Column(col, sa.DateTime(timezone=True), nullable=True)
        )
    op.add_column(
        "calendar_events", sa.Column("recurrence_rule", sa.String(length=40), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("calendar_events", "recurrence_rule")
    for col in reversed(_DATE_COLS):
        op.drop_column("calendar_events", col)
