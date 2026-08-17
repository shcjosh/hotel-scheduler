import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import groupby

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import (
    DBackupRequest,
    DesignatedOffDay,
    Employee,
    PreviousMonthLink,
    ScheduleEntry,
    SpecialLeave,
)


@dataclass
class EmployeeData:
    id: int
    name: str
    role: str
    available_shifts: list[str]
    preferred_shift: str | None
    scheduling_mode: str


@dataclass
class ShiftScheduleData:
    employees: list[EmployeeData]
    year: int
    month: int
    num_days: int
    dates: list[date]
    weeks: list[list[int]]
    saturdays: list[int]
    sundays: list[int]
    designated_off_days: dict[int, list[int]]
    special_leaves: dict[int, list[int]]
    previous_month: dict[int, list[str | None]]
    night_schedule: dict[int, dict[int, str]]
    d_backup_requests: list[int]
    d_backup_assignments: dict[int, int]

    def emp_index(self) -> dict[int, int]:
        return {emp.id: i for i, emp in enumerate(self.employees)}


def _parse_shifts(raw: str | None) -> list[str]:
    import json

    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def load(db: Session, year: int, month: int) -> ShiftScheduleData:
    num_days = calendar.monthrange(year, month)[1]
    dates = [date(year, month, d) for d in range(1, num_days + 1)]

    weeks: list[list[int]] = []
    for _, group in groupby(
        enumerate(dates), key=lambda x: x[1] - timedelta(days=x[1].weekday())
    ):
        weeks.append([d_idx for d_idx, _ in group])

    saturdays = [i for i, dt in enumerate(dates) if dt.weekday() == 5]
    sundays = [i for i, dt in enumerate(dates) if dt.weekday() == 6]

    employees = [
        EmployeeData(
            id=e.id,
            name=e.name,
            role=e.role,
            available_shifts=_parse_shifts(e.available_shifts),
            preferred_shift=e.preferred_shift,
            scheduling_mode=e.scheduling_mode,
        )
        for e in db.scalars(
            select(Employee).where(Employee.is_active == 1).order_by(Employee.id)
        )
    ]

    designated: dict[int, list[int]] = {}
    for row in db.scalars(
        select(DesignatedOffDay).where(
            DesignatedOffDay.year == year, DesignatedOffDay.month == month
        )
    ):
        designated.setdefault(row.employee_id, []).append(row.day)

    special: dict[int, list[int]] = {}
    for row in db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.year == year, SpecialLeave.month == month
        )
    ):
        special.setdefault(row.employee_id, []).append(row.day)

    previous_month: dict[int, list[str | None]] = {}
    for row in db.scalars(
        select(PreviousMonthLink).where(
            PreviousMonthLink.year == year, PreviousMonthLink.month == month
        )
    ):
        previous_month[row.employee_id] = [
            row.day_5_shift,
            row.day_4_shift,
            row.day_3_shift,
            row.day_2_shift,
            row.day_1_shift,
        ]

    night_schedule: dict[int, dict[int, str]] = {}
    night_ids = [e.id for e in employees if e.role == "night"]
    if night_ids:
        for row in db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.employee_id.in_(night_ids),
                ScheduleEntry.year == year,
                ScheduleEntry.month == month,
                ScheduleEntry.source == "night_input",
            )
        ):
            night_schedule.setdefault(row.employee_id, {})[row.day] = row.shift
        for nid in night_ids:
            night_schedule.setdefault(nid, {})

    d_backup_requests: list[int] = []
    d_backup_assignments: dict[int, int] = {}
    cd_backup_ids = [e.id for e in employees if e.role == "cd_backup"]
    for row in db.scalars(
        select(DBackupRequest).where(
            DBackupRequest.year == year, DBackupRequest.month == month
        )
    ):
        d_backup_requests.append(row.day)
        assigned = row.assigned_employee_id
        if assigned is None:
            assigned = cd_backup_ids[0] if cd_backup_ids else None
        if assigned is not None:
            d_backup_assignments[row.day] = assigned

    return ShiftScheduleData(
        employees=employees,
        year=year,
        month=month,
        num_days=num_days,
        dates=dates,
        weeks=weeks,
        saturdays=saturdays,
        sundays=sundays,
        designated_off_days=designated,
        special_leaves=special,
        previous_month=previous_month,
        night_schedule=night_schedule,
        d_backup_requests=sorted(d_backup_requests),
        d_backup_assignments=d_backup_assignments,
    )
