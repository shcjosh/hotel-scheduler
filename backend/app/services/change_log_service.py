from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import ScheduleChangeLog


def record_change(
    db: Session,
    year: int,
    month: int,
    emp_id: int,
    day: int,
    old_shift: str,
    new_shift: str,
    reason: str | None = None,
) -> ScheduleChangeLog:
    rec = ScheduleChangeLog(
        year=year,
        month=month,
        employee_id=emp_id,
        day=day,
        old_shift=old_shift,
        new_shift=new_shift,
        reason=reason,
    )
    db.add(rec)
    db.flush()
    db.refresh(rec)
    return rec


def list_change_logs(db: Session, year: int, month: int) -> list[ScheduleChangeLog]:
    return list(
        db.scalars(
            select(ScheduleChangeLog)
            .where(ScheduleChangeLog.year == year, ScheduleChangeLog.month == month)
            .order_by(ScheduleChangeLog.created_at, ScheduleChangeLog.id)
        )
    )
