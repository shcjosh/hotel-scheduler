from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database.models import Employee, ScheduleEntry, now_iso
from app.schemas.schedule import ScheduleEntryCreate, ScheduleEntryUpdate


def list_entries(
    db: Session,
    *,
    employee_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
    day: int | None = None,
) -> list[ScheduleEntry]:
    stmt = select(ScheduleEntry)
    if employee_id is not None:
        stmt = stmt.where(ScheduleEntry.employee_id == employee_id)
    if year is not None:
        stmt = stmt.where(ScheduleEntry.year == year)
    if month is not None:
        stmt = stmt.where(ScheduleEntry.month == month)
    if day is not None:
        stmt = stmt.where(ScheduleEntry.day == day)
    return list(db.scalars(stmt.order_by(ScheduleEntry.employee_id, ScheduleEntry.day)))


def get_month_view(
    db: Session, year: int, month: int, num_days: int
) -> dict[str, list[str]]:
    """Return {employee_name: [shift per day]} for the month (empty days -> 'OFF')."""
    employees = list(
        db.scalars(
            select(Employee)
            .where(Employee.is_active == 1)
            .order_by(Employee.id)
        )
    )
    name_by_id = {e.id: e.name for e in employees}
    entries = list_entries(db, year=year, month=month)

    by_emp: dict[int, dict[int, str]] = {e.id: {} for e in employees}
    for entry in entries:
        if entry.employee_id in by_emp:
            by_emp[entry.employee_id][entry.day] = entry.shift

    schedule: dict[str, list[str]] = {}
    for emp in employees:
        row = [by_emp[emp.id].get(d, "OFF") for d in range(1, num_days + 1)]
        schedule[emp.name] = row
    return schedule


def replace_month_schedule(
    db: Session,
    year: int,
    month: int,
    entries: list[dict],
) -> None:
    """Delete all schedule entries for the month and insert the given entries."""
    db.execute(
        delete(ScheduleEntry).where(
            ScheduleEntry.year == year, ScheduleEntry.month == month
        )
    )
    for e in entries:
        db.add(
            ScheduleEntry(
                employee_id=e["employee_id"],
                year=year,
                month=month,
                day=e["day"],
                shift=e["shift"],
                source=e["source"],
            )
        )
    db.commit()


def get_entry(db: Session, entry_id: int) -> ScheduleEntry | None:
    return db.get(ScheduleEntry, entry_id)


def create_entry(db: Session, data: ScheduleEntryCreate) -> ScheduleEntry:
    entry = ScheduleEntry(
        employee_id=data.employee_id,
        year=data.year,
        month=data.month,
        day=data.day,
        shift=data.shift,
        source=data.source,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_entry(
    db: Session, entry: ScheduleEntry, data: ScheduleEntryUpdate
) -> ScheduleEntry:
    payload = data.model_dump(exclude_unset=True)
    if "shift" in payload:
        entry.shift = payload["shift"]
    if "source" in payload:
        entry.source = payload["source"]
    entry.updated_at = now_iso()
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: Session, entry: ScheduleEntry) -> None:
    db.delete(entry)
    db.commit()
