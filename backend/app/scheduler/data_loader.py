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
    Setting,
    SpecialLeave,
    SupportRequest,
)
from app.scheduler.off_count import count_off_blocks
from app.services.employee_service import (
    _from_json,
    is_schedulable_on,
    not_housekeeping_clause,
    visible_in_month_clause,
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
    fridays: list[int]
    designated_off_days: dict[int, list[int]]
    special_leaves: dict[int, list[int]]
    previous_month: dict[int, list[str | None]]
    night_schedule: dict[int, dict[int, str]]
    d_backup_requests: list[int]
    d_backup_assignments: dict[int, int]
    d_backup_unfillable: dict[int, str] = field(default_factory=dict)
    # 所有手動模式員工（含大夜專職與一般手動如 PT）當月已輸入格位：emp_id -> {day: shift}
    manual_schedule: dict[int, dict[int, str]] = field(default_factory=dict)
    night_rule_overrides: dict[int, set[str]] = field(default_factory=dict)
    night_ignore_all: set[int] = field(default_factory=set)
    external_support: dict[int, set[str]] = field(default_factory=dict)
    external_support_all: set[str] = field(default_factory=set)
    # H14 驗證用：該月「非 ignored」支援請求的每日班次集合（day -> {shift}）。
    support_requests: dict[int, set[str]] = field(default_factory=dict)
    last_month_consecutive_off: dict[int, int] = field(default_factory=dict)
    # 店長（管理職）每月可被排 A/C 的格數上限；None = 不限制（現況）。
    # 由每月設定 manager_backup_cap:{y}:{m} 讀入，每位管理職各自計算。
    manager_backup_cap: int | None = None
    # 離職月內「月中離職」的員工：emp_id -> 最後上班日（1-based）。
    # 這些員工在該月最後上班日之後固定不排班，且不套用 H2/H3/H4/H12。
    resign_cutoff: dict[int, int] = field(default_factory=dict)
    # 到職月內「月中到職」的員工：emp_id -> 到職日（1-based，> 1）。
    # 這些員工在該月到職日之前固定不排班，且不套用 H2/H3/H4/H8/H9/H12。
    hire_start: dict[int, int] = field(default_factory=dict)

    def emp_index(self) -> dict[int, int]:
        return {emp.id: i for i, emp in enumerate(self.employees)}

    def is_employed_on(self, emp_id: int, day: int) -> bool:
        """員工在當月第 day 日（1-based）是否在職。"""
        first = self.hire_start.get(emp_id, 1)
        last = self.resign_cutoff.get(emp_id, self.num_days)
        return first <= day <= last

    def is_external(self, day: int, shift: str) -> bool:
        return shift in self.external_support_all or shift in self.external_support.get(day, set())


def _backup_unfillable_reason(non_mgr_ids: list[int], mgr_ids: list[int]) -> str:
    if not non_mgr_ids and not mgr_ids:
        return "無勾選 D 班的自動排班人員"
    if not non_mgr_ids:
        return "無非管理職可上 D 班人員，且管理職當日無法補 D"
    if not mgr_ids:
        return "可上 D 班的櫃台人員當日無法補 D，且無可上 D 班的管理職"
    return "可上 D 班的櫃台與管理職人員當日均無法補 D"


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

    employees: list[EmployeeData] = []
    emp_models_by_id: dict[int, Employee] = {}
    resign_cutoff: dict[int, int] = {}
    hire_start: dict[int, int] = {}
    for e in db.scalars(
        select(Employee)
        .where(
            Employee.is_active == 1,
            (Employee.tag.is_(None)) | (Employee.tag == ""),
            not_housekeeping_clause(),
            visible_in_month_clause(year, month),
        )
        .order_by(Employee.sort_order.asc(), Employee.id.asc())
    ):
        emp_models_by_id[e.id] = e
        employees.append(
            EmployeeData(
                id=e.id,
                name=e.name,
                role=e.role,
                available_shifts=_from_json(e.available_shifts),
                preferred_shift=e.preferred_shift,
                scheduling_mode=e.scheduling_mode,
            )
        )
        # 月中到職（到職日在該月內且非 1 日）：設定排班起始日
        if e.hire_date:
            h_year, h_month, h_day = (
                int(e.hire_date[0:4]),
                int(e.hire_date[5:7]),
                int(e.hire_date[8:10]),
            )
            if h_year == year and h_month == month and h_day > 1:
                hire_start[e.id] = h_day
        # 月中離職（最後上班日在該月內且非月底）：設定排班截止日
        if e.resign_date:
            r_year, r_month, r_day = (
                int(e.resign_date[0:4]),
                int(e.resign_date[5:7]),
                int(e.resign_date[8:10]),
            )
            if r_year == year and r_month == month and r_day < num_days:
                resign_cutoff[e.id] = r_day

    def _in_employment(eid: int, day: int) -> bool:
        return hire_start.get(eid, 1) <= day <= resign_cutoff.get(eid, num_days)

    designated: dict[int, list[int]] = {}
    for row in db.scalars(
        select(DesignatedOffDay).where(
            DesignatedOffDay.year == year, DesignatedOffDay.month == month
        )
    ):
        if row.employee_id in emp_models_by_id and not _in_employment(row.employee_id, row.day):
            continue
        designated.setdefault(row.employee_id, []).append(row.day)

    special: dict[int, list[int]] = {}
    for row in db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.year == year, SpecialLeave.month == month
        )
    ):
        if row.employee_id in emp_models_by_id and not _in_employment(row.employee_id, row.day):
            continue
        special.setdefault(row.employee_id, []).append(row.day)

    previous_month: dict[int, list[str | None]] = {}
    for row in db.scalars(
        select(PreviousMonthLink).where(
            PreviousMonthLink.year == year, PreviousMonthLink.month == month
        )
    ):
        previous_month[row.employee_id] = [
            row.day_6_shift,
            row.day_5_shift,
            row.day_4_shift,
            row.day_3_shift,
            row.day_2_shift,
            row.day_1_shift,
        ]

    night_schedule: dict[int, dict[int, str]] = {}
    manual_schedule: dict[int, dict[int, str]] = {}
    manual_ids = [e.id for e in employees if e.scheduling_mode == "manual"]
    night_ids = {e.id for e in employees if e.role == "night"}
    if manual_ids:
        for row in db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.employee_id.in_(manual_ids),
                ScheduleEntry.year == year,
                ScheduleEntry.month == month,
            )
        ):
            if not _in_employment(row.employee_id, row.day):
                continue
            manual_schedule.setdefault(row.employee_id, {})[row.day] = row.shift
            if row.employee_id in night_ids:
                night_schedule.setdefault(row.employee_id, {})[row.day] = row.shift
        for mid in manual_ids:
            manual_schedule.setdefault(mid, {})
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

    # 指派鏈（v1.4.0）：所有「自動排班且勾選 D 班（排除見習生）」的人員；
    # 順位：非管理職櫃台 → 管理職 → 無法指派
    d_backup_unfillable: dict[int, str] = {}
    non_mgr_d_ids = [
        e.id
        for e in employees
        if e.scheduling_mode == "auto"
        and "D" in e.available_shifts
        and e.role not in ("manager", "trainee")
    ]
    manager_d_ids = [
        e.id
        for e in employees
        if e.scheduling_mode == "auto"
        and "D" in e.available_shifts
        and e.role == "manager"
    ]
    for day in sorted(d_backup_requests):
        if day in d_backup_assignments:
            continue
        assigned = None
        for eid in non_mgr_d_ids:
            if (
                day not in designated.get(eid, [])
                and day not in special.get(eid, [])
                and _in_employment(eid, day)
            ):
                assigned = eid
                break
        if assigned is None:
            for eid in manager_d_ids:
                if (
                    day not in designated.get(eid, [])
                    and day not in special.get(eid, [])
                    and _in_employment(eid, day)
                ):
                    assigned = eid
                    break
        if assigned is None:
            d_backup_unfillable[day] = _backup_unfillable_reason(non_mgr_d_ids, manager_d_ids)
        else:
            d_backup_assignments[day] = assigned

    # 大夜規則開關：v1.4.0 起預設關閉（ignore_all=True，個別規則預設 False）
    raw_overrides: dict[int, dict[str, bool]] = {}
    for row in db.scalars(select(NightRuleOverride)):
        raw_overrides.setdefault(row.employee_id, {})[row.rule_name] = bool(row.enabled)

    night_rule_overrides: dict[int, set[str]] = {}
    night_ignore_all: set[int] = set()
    for emp in employees:
        if emp.role != "night":
            continue
        emp_ov = raw_overrides.get(emp.id, {})
        if emp_ov.get("ALL", True):
            night_ignore_all.add(emp.id)
        night_rule_overrides[emp.id] = {
            r for r in ("H2", "H3", "H4", "H12") if emp_ov.get(r, False)
        }

    external_support: dict[int, set[str]] = {}
    external_support_all: set[str] = set()
    support_requests: dict[int, set[str]] = {}
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
            support_requests.setdefault(row.day, set()).add(row.shift)

    # 二館支援：帶 tag 的員工為外部支援，手動排的 A1/C1/D1 計入該日該班覆蓋
    support_emps = {
        e.id: e
        for e in db.scalars(
            select(Employee).where(
                Employee.is_active == 1,
                Employee.tag.is_not(None),
                Employee.tag != "",
                not_housekeeping_clause(),
                visible_in_month_clause(year, month),
            )
        )
    }
    if support_emps:
        for row in db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.employee_id.in_(list(support_emps.keys())),
                ScheduleEntry.year == year,
                ScheduleEntry.month == month,
            )
        ):
            sup_emp = support_emps.get(row.employee_id)
            if sup_emp is not None and not is_schedulable_on(sup_emp, year, month, row.day):
                continue
            shift = row.shift
            if shift in ("A1", "C1", "D1"):
                base = shift[0]  # A1->A, C1->C, D1->D
                external_support.setdefault(row.day, set()).add(base)

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
                emp_model = emp_models_by_id.get(emp.id)
                shifts = [
                    (
                        prev_by_emp[emp.id].get(d, "OFF")
                        if (emp_model is None or is_schedulable_on(emp_model, prev_y, prev_m, d))
                        else None
                    )
                    for d in range(1, prev_days + 1)
                ]
                cnt, _ = count_off_blocks(shifts)
                last_month_off[emp.id] = cnt

    # 店長卡班上限（每月設定，空白 = 不限制）：每位管理職 A/C 合計上限格數
    cap_raw = db.scalar(
        select(Setting.value).where(
            Setting.key == f"manager_backup_cap:{year}:{month}"
        )
    )
    manager_backup_cap = (
        int(str(cap_raw).strip())
        if cap_raw is not None and str(cap_raw).strip().isdigit()
        else None
    )

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
        manual_schedule=manual_schedule,
        d_backup_requests=sorted(d_backup_requests),
        d_backup_assignments=d_backup_assignments,
        d_backup_unfillable=d_backup_unfillable,
        night_rule_overrides=night_rule_overrides,
        night_ignore_all=night_ignore_all,
        external_support=external_support,
        external_support_all=external_support_all,
        support_requests=support_requests,
        last_month_consecutive_off=last_month_off,
        manager_backup_cap=manager_backup_cap,
        resign_cutoff=resign_cutoff,
        hire_start=hire_start,
    )
