from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database.models import (
    DesignatedOffDay,
    Employee,
    PreviousMonthLink,
    ScheduleEntry,
    SpecialLeave,
    now_iso,
)
from app.schemas.schedule import ScheduleEntryCreate, ScheduleEntryUpdate
from app.scheduler.off_count import count_off_blocks

import calendar
import json

VALID_CELL_SHIFTS = {"A", "B", "C", "D", "M", "OFF", "SPECIAL"}
WORK_SHIFTS_SET = {"A", "B", "C", "D"}


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
    entries = list_entries(db, year=year, month=month)

    by_emp: dict[int, dict[int, str]] = {e.id: {} for e in employees}
    src_by_emp: dict[int, dict[int, str]] = {e.id: {} for e in employees}
    for entry in entries:
        if entry.employee_id in by_emp:
            by_emp[entry.employee_id][entry.day] = entry.shift
            src_by_emp[entry.employee_id][entry.day] = entry.source

    leave_by_emp: dict[int, dict[int, str]] = {}
    for lv in db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.year == year, SpecialLeave.month == month
        )
    ):
        leave_by_emp.setdefault(lv.employee_id, {})[lv.day] = lv.leave_type

    schedule: dict[str, list[str]] = {}
    sources: dict[str, list[str]] = {}
    leave_details: dict[str, dict[int, str]] = {}
    for emp in employees:
        schedule[emp.name] = [by_emp[emp.id].get(d, "OFF") for d in range(1, num_days + 1)]
        sources[emp.name] = [src_by_emp[emp.id].get(d, "auto") for d in range(1, num_days + 1)]
        leave_details[emp.name] = leave_by_emp.get(emp.id, {})
    return {"schedule": schedule, "sources": sources, "leave_details": leave_details}


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


def clear_month_schedule(db: Session, year: int, month: int) -> int:
    """Delete all non-night manual/auto schedule entries for the month.

    Night staff (source='night_input') entries are kept — those are cleared
    separately via night_service.clear_night_schedule.
    """
    result = db.execute(
        delete(ScheduleEntry).where(
            ScheduleEntry.year == year,
            ScheduleEntry.month == month,
            ScheduleEntry.source != "night_input",
        )
    )
    db.commit()
    return result.rowcount or 0


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


def upsert_cell(
    db: Session,
    emp_id: int,
    year: int,
    month: int,
    day: int,
    shift: str,
    leave_type: str | None = None,
    reason: str | None = None,
) -> ScheduleEntry:
    emp = db.get(Employee, emp_id)
    if emp is None or not emp.is_active:
        raise ValueError("員工不存在或已離職")
    if shift not in VALID_CELL_SHIFTS:
        raise ValueError(f"無效班次：{shift}")

    from app.services import status_service

    status = status_service.get_status(db, year, month)
    if status == "locked":
        raise PermissionError("班表已鎖定，無法修改")

    existing = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.employee_id == emp_id,
            ScheduleEntry.year == year,
            ScheduleEntry.month == month,
            ScheduleEntry.day == day,
        )
    ).first()
    if existing is not None and existing.source == "night_input":
        raise PermissionError("大夜專職班次請至大夜班表頁面修改")

    old_shift = existing.shift if existing is not None else "OFF"

    # Sync leave/designated records with the new cell value.
    if shift == "SPECIAL":
        lt = leave_type or "SPECIAL"
        sl = db.scalars(
            select(SpecialLeave).where(
                SpecialLeave.employee_id == emp_id,
                SpecialLeave.year == year,
                SpecialLeave.month == month,
                SpecialLeave.day == day,
            )
        ).first()
        if sl is None:
            db.add(
                SpecialLeave(
                    employee_id=emp_id, year=year, month=month, day=day, leave_type=lt
                )
            )
        else:
            sl.leave_type = lt
        drec = db.scalars(
            select(DesignatedOffDay).where(
                DesignatedOffDay.employee_id == emp_id,
                DesignatedOffDay.year == year,
                DesignatedOffDay.month == month,
                DesignatedOffDay.day == day,
            )
        ).first()
        if drec is not None:
            db.delete(drec)
    else:
        sl = db.scalars(
            select(SpecialLeave).where(
                SpecialLeave.employee_id == emp_id,
                SpecialLeave.year == year,
                SpecialLeave.month == month,
                SpecialLeave.day == day,
            )
        ).first()
        if sl is not None:
            db.delete(sl)

    if existing is not None:
        existing.shift = shift
        existing.source = "manual"
        existing.updated_at = now_iso()
    else:
        existing = ScheduleEntry(
            employee_id=emp_id, year=year, month=month, day=day,
            shift=shift, source="manual",
        )
        db.add(existing)

    db.flush()

    if status == "published":
        from app.services import change_log_service

        change_log_service.record_change(
            db, year, month, emp_id, day, old_shift, shift, reason
        )

    db.commit()
    db.refresh(existing)
    return existing


def validate_cell(
    db: Session, emp_id: int, year: int, month: int, day: int, new_shift: str
) -> dict:
    emp = db.get(Employee, emp_id)
    if emp is None or not emp.is_active:
        raise ValueError("員工不存在或已離職")
    if new_shift not in VALID_CELL_SHIFTS:
        raise ValueError(f"無效班次：{new_shift}")

    num_days = calendar.monthrange(year, month)[1]
    entries = {
        e.day: (e.shift, e.source)
        for e in db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.employee_id == emp_id,
                ScheduleEntry.year == year,
                ScheduleEntry.month == month,
            )
        )
    }
    shifts = [entries.get(d, (None, None))[0] for d in range(1, num_days + 1)]
    link = db.scalars(
        select(PreviousMonthLink).where(
            PreviousMonthLink.employee_id == emp_id,
            PreviousMonthLink.year == year,
            PreviousMonthLink.month == month,
        )
    ).first()
    prev_shifts = (
        [link.day_5_shift, link.day_4_shift, link.day_3_shift, link.day_2_shift, link.day_1_shift]
        if link else [None] * 5
    )

    shifts[day - 1] = new_shift
    avail = set(json.loads(emp.available_shifts)) if emp.available_shifts else set()
    idx = day - 1
    prev_shift = shifts[idx - 1] if day > 1 else prev_shifts[-1]
    next_shift = shifts[idx + 1] if day < num_days else None

    violations: list[dict] = []
    warnings: list[dict] = []

    def v(rule, msg):
        violations.append({"rule": rule, "severity": "hard", "message": msg})

    def w(rule, msg):
        warnings.append({"rule": rule, "severity": "soft", "message": msg})

    # H7
    if new_shift in WORK_SHIFTS_SET and new_shift not in avail:
        v("H7", f"{new_shift} 不在 {emp.name} 的可用班次")

    # H5 prev -> cell, cell -> next
    if prev_shift == "C" and new_shift == "A":
        v("H5", f"前日 C → {month}/{day} A 違規：C 班隔天不可接 A 班")
    if prev_shift == "D" and new_shift == "A":
        v("H5", f"前日 D → {month}/{day} A 違規：D 班隔天不可接 A 班")
    if prev_shift == "D" and new_shift == "C":
        v("H5", f"前日 D → {month}/{day} C 違規：D 班隔天不可接 C 班")
    if prev_shift == "D" and new_shift == "M":
        v("H5", f"前日 D → {month}/{day} M 違規：D 班隔天不可接 M 班")
    if next_shift is not None:
        if new_shift == "C" and next_shift == "A":
            v("H5", f"{month}/{day} C → 次日 A 違規：C 班隔天不可接 A 班")
        if new_shift == "D" and next_shift == "A":
            v("H5", f"{month}/{day} D → 次日 A 違規：D 班隔天不可接 A 班")
        if new_shift == "D" and next_shift == "C":
            v("H5", f"{month}/{day} D → 次日 C 違規：D 班隔天不可接 C 班")
        if new_shift == "D" and next_shift == "M":
            v("H5", f"{month}/{day} D → 次日 M 違規：D 班隔天不可接 M 班")

    # S2/S3
    def soft_trans(cur, nxt, label):
        if cur == "B" and nxt == "A":
            w("S2", f"{label} B→A 盡量避免")
        if cur == "C" and nxt == "B":
            w("S3", f"{label} C→B 盡量避免")

    if prev_shift is not None:
        soft_trans(prev_shift, new_shift, f"前日→{month}/{day}")
    if next_shift is not None:
        soft_trans(new_shift, next_shift, f"{month}/{day}→次日")

    # H4: 6-day windows containing the cell (extended with prev 5)
    extended = prev_shifts + shifts
    cell_idx = day + 4  # index in extended
    for start in range(max(0, cell_idx - 5), min(len(extended) - 5, cell_idx) + 1):
        window = extended[start:start + 6]
        if None in window:
            continue
        if not any(s in ("OFF", "SPECIAL") for s in window):
            v("H4", f"連續 6 天上班（含跨月）含 {month}/{day}")
            break

    # H12: recompute 連休 blocks
    runs, _ = count_off_blocks(shifts)
    if runs != 2:
        v("H12", f"連休 {runs} 次（應為 2）")

    return {"violations": violations, "warnings": warnings}


def get_validation_report(db: Session, year: int, month: int) -> dict:
    from app.scheduler import data_loader, validator

    data = data_loader.load(db, year, month)
    num_days = data.num_days
    entries = list_entries(db, year=year, month=month)
    by_emp: dict[int, dict[int, str]] = {e.id: {} for e in data.employees}
    for e in entries:
        if e.employee_id in by_emp:
            by_emp[e.employee_id][e.day] = e.shift
    schedule = {
        emp.id: [by_emp[emp.id].get(d) for d in range(1, num_days + 1)]
        for emp in data.employees
    }

    hard = validator.validate(data, schedule)
    soft = validator.validate_soft(data, schedule)
    s5_count = validator.count_preferred_unsatisfied(data, schedule)
    s6_spread = validator.compute_fairness_spread(data, schedule)

    # filter out violations for disabled night rules
    night_rules = {"H2", "H3", "H4", "H12"}
    disabled_night: dict[str, list[str]] = {}
    hard_filtered = []
    for v in hard:
        if v["rule"] in night_rules and v["employee_id"] is not None:
            emp = next((e for e in data.employees if e.id == v["employee_id"]), None)
            if emp and emp.role == "night":
                enabled = data.night_rule_overrides.get(emp.id)
                if enabled is not None and v["rule"] not in enabled:
                    continue
        hard_filtered.append(v)
    hard = hard_filtered

    for emp in data.employees:
        if emp.role != "night":
            continue
        if emp.id in data.night_ignore_all:
            disabled_night[str(emp.id)] = ["ALL"]
            continue
        enabled = data.night_rule_overrides.get(emp.id)
        if enabled is not None:
            disabled = [r for r in night_rules if r not in enabled]
            if disabled:
                disabled_night[str(emp.id)] = disabled

    hard_out = [{**h, "severity": "hard"} for h in hard]
    soft_out = [{**s, "severity": "soft"} for s in soft]
    if s6_spread > 2:
        soft_out.append({
            "rule": "S6", "severity": "soft", "employee_id": None,
            "employee_name": None, "day": None,
            "message": f"上班天數最大最小差 {s6_spread}（建議 <=2）",
        })

    per_rule: dict[str, dict] = {}
    for rule, desc in validator.RULE_DESCRIPTIONS.items():
        if rule.startswith("H"):
            cnt = sum(1 for h in hard if h["rule"] == rule)
        elif rule == "S5":
            cnt = s5_count
        elif rule == "S6":
            cnt = 1 if s6_spread > 2 else 0
        else:
            cnt = sum(1 for s in soft if s["rule"] == rule)
        per_rule[rule] = {"violations": cnt, "description": desc}

    total_hard = len(hard_out)
    total_soft = len(soft_out)
    return {
        "summary": {
            "total_violations": total_hard + total_soft,
            "hard_violations": total_hard,
            "soft_warnings": total_soft,
            "is_valid": total_hard == 0,
        },
        "violations": hard_out,
        "warnings": soft_out,
        "per_rule_summary": per_rule,
        "disabled_night_rules": disabled_night,
    }
