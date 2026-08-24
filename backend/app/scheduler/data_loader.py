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
    NightRuleOverride,
    PreviousMonthLink,
    ScheduleEntry,
    SpecialLeave,
    SupportRequest,
)
from app.scheduler.off_count import count_off_blocks
from app.services.employee_service import _from_json


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
    fridays: list[int]
    designated_off_days: dict[int, list[int]]
    special_leaves: dict[int, list[int]]
    previous_month: dict[int, list[str | None]]
    night_schedule: dict[int, dict[int, str]]
    d_backup_requests: list[int]
    d_backup_assignments: dict[int, int]
    d_backup_unfillable: dict[int, str] = field(default_factory=dict)
    night_rule_overrides: dict[int, set[str]] = field(default_factory=dict)
    night_ignore_all: set[int] = field(default_factory=set)
    external_support: dict[int, set[str]] = field(default_factory=dict)
    external_support_all: set[str] = field(default_factory=set)
    last_month_consecutive_off: dict[int, int] = field(default_factory=dict)

    def emp_index(self) -> dict[int, int]:
        return {emp.id: i for i, emp in enumerate(self.employees)}

    def is_external(self, day: int, shift: str) -> bool:
        return shift in self.external_support_all or shift in self.external_support.get(day, set())


def _backup_unfillable_reason(cd_ids: list[int], mgr_ids: list[int]) -> str:
    if not cd_ids and not mgr_ids:
        return "無 CD 備援或管理職人員"
    if not cd_ids:
        return "無 CD 備援人員，且管理職當日無法補 D"
    if not mgr_ids:
        return "CD 備援人員當日無法補 D，且無管理職人員"
    return "CD 備援與管理職人員當日均無法補 D"


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
    fridays = [i for i, dt in enumerate(dates) if dt.weekday() == 4]

    employees = [
        EmployeeData(
            id=e.id,
            name=e.name,
            role=e.role,
            available_shifts=_from_json(e.available_shifts),
            preferred_shift=e.preferred_shift,
            scheduling_mode=e.scheduling_mode,
        )
        for e in db.scalars(
            select(Employee)
            .where(Employee.is_active == 1)
            .order_by(Employee.sort_order.asc(), Employee.id.asc())
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
    for row in db.scalars(
        select(DBackupRequest).where(
            DBackupRequest.year == year, DBackupRequest.month == month
        )
    ):
        d_backup_requests.append(row.day)
        if row.assigned_employee_id is not None:
            d_backup_assignments[row.day] = row.assigned_employee_id

    # 指派鏈：CD 備援 → 管理職 → 無法指派
    d_backup_unfillable: dict[int, str] = {}
    cd_backup_ids = [e.id for e in employees if e.role == "cd_backup"]
    manager_ids = [e.id for e in employees if e.role == "manager"]
    for day in sorted(d_backup_requests):
        if day in d_backup_assignments:
            continue
        assigned = None
        for eid in cd_backup_ids:
            if day not in designated.get(eid, []) and day not in special.get(eid, []):
                assigned = eid
                break
        if assigned is None:
            for eid in manager_ids:
                if day not in designated.get(eid, []) and day not in special.get(eid, []):
                    assigned = eid
                    break
        if assigned is None:
            d_backup_unfillable[day] = _backup_unfillable_reason(cd_backup_ids, manager_ids)
        else:
            d_backup_assignments[day] = assigned

    night_rule_overrides: dict[int, set[str]] = {}
    night_ignore_all: set[int] = set()
    for row in db.scalars(select(NightRuleOverride)):
        if row.rule_name == "ALL":
            if row.enabled:
                night_ignore_all.add(row.employee_id)
        elif row.enabled:
            night_rule_overrides.setdefault(row.employee_id, set()).add(row.rule_name)

    external_support: dict[int, set[str]] = {}
    external_support_all: set[str] = set()
    for row in db.scalars(
        select(SupportRequest).where(
            SupportRequest.year == year, SupportRequest.month == month
        )
    ):
        if row.status == "ignored":
            continue
        if row.day == 0:
            external_support_all.add(row.shift)
        else:
            external_support.setdefault(row.day, set()).add(row.shift)

    # K.1: Load last month consecutive off count per employee
    last_month_off: dict[int, int] = {}
    prev_y = year if month > 1 else year - 1
    prev_m = month - 1 if month > 1 else 12
    prev_days = calendar.monthrange(prev_y, prev_m)[1]
    prev_entries = list(
        db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.year == prev_y, ScheduleEntry.month == prev_m
            )
        )
    )
    if prev_entries:
        prev_by_emp: dict[int, dict[int, str]] = {}
        for pe in prev_entries:
            prev_by_emp.setdefault(pe.employee_id, {})[pe.day] = pe.shift
        for emp in employees:
            if emp.id in prev_by_emp:
                shifts = [prev_by_emp[emp.id].get(d, "OFF") for d in range(1, prev_days + 1)]
                cnt, _ = count_off_blocks(shifts)
                last_month_off[emp.id] = cnt

    return ShiftScheduleData(
        employees=employees,
        year=year,
        month=month,
        num_days=num_days,
        dates=dates,
        weeks=weeks,
        saturdays=saturdays,
        sundays=sundays,
        fridays=fridays,
        designated_off_days=designated,
        special_leaves=special,
        previous_month=previous_month,
        night_schedule=night_schedule,
        d_backup_requests=sorted(d_backup_requests),
        d_backup_assignments=d_backup_assignments,
        d_backup_unfillable=d_backup_unfillable,
        night_rule_overrides=night_rule_overrides,
        night_ignore_all=night_ignore_all,
        external_support=external_support,
        external_support_all=external_support_all,
        last_month_consecutive_off=last_month_off,
    )
