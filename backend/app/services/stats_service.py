import calendar
import json
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import Employee, ScheduleEntry, Setting
from app.services import off_day_service, schedule_service

WORK_SHIFTS = ("A", "B", "C", "D", "M")
ALL_COUNT_SHIFTS = ("A", "B", "C", "D", "M", "OFF", "SPECIAL")


def _store_key(year: int, month: int) -> str:
    return f"solve:{year}:{month}"


def store_solve_meta(
    db: Session, year: int, month: int, success: bool,
    objective: float | None, solve_time: float | None,
    soft_stats: dict | None,
) -> None:
    from app.database.models import now_iso
    value = json.dumps({
        "status": "solved" if success else "unsolved",
        "objective_value": objective,
        "solve_time": solve_time,
        "soft_constraint_stats": soft_stats,
    }, ensure_ascii=False)
    rec = db.get(Setting, _store_key(year, month))
    if rec is None:
        db.add(Setting(key=_store_key(year, month), value=value))
    else:
        rec.value = value
        rec.updated_at = now_iso()
    db.commit()


def _get_solve_meta(db: Session, year: int, month: int) -> dict:
    rec = db.get(Setting, _store_key(year, month))
    if rec is None:
        return {"status": None, "objective_value": None, "solve_time": None, "soft_constraint_stats": None}
    return json.loads(rec.value)


def _max_consecutive_work(shifts: list[str | None]) -> int:
    mx = 0
    run = 0
    for s in shifts:
        if s in WORK_SHIFTS:
            run += 1
            mx = max(mx, run)
        else:
            run = 0
    return mx


def _preferred_satisfied(emp: Employee, shifts: list[str | None]) -> int:
    if not emp.preferred_shift:
        return 0
    return sum(1 for s in shifts if s == emp.preferred_shift)


def get_month_stats(db: Session, year: int, month: int) -> dict:
    num_days = calendar.monthrange(year, month)[1]
    view = schedule_service.get_month_view(db, year, month, num_days)
    schedule = view["schedule"]

    employees = list(
        db.scalars(
            select(Employee).where(Employee.is_active == 1).order_by(Employee.id)
        )
    )

    saturdays = [d for d in range(1, num_days + 1) if date(year, month, d).weekday() == 5]
    sundays = [d for d in range(1, num_days + 1) if date(year, month, d).weekday() == 6]
    weekend_set = set(saturdays + sundays)

    # per_employee
    per_employee = []
    for emp in employees:
        row = schedule.get(emp.name, [None] * num_days)
        counts: dict[str, int] = {s: 0 for s in ALL_COUNT_SHIFTS}
        for s in row:
            if s in counts:
                counts[s] += 1
        work_days = sum(counts[s] for s in WORK_SHIFTS)
        weekend_work = sum(1 for i, s in enumerate(row) if (i + 1) in weekend_set and s in WORK_SHIFTS)
        consec_off = off_day_service.count_consecutive_off(db, emp.id, year, month)[0]
        per_employee.append({
            "employee_id": emp.id,
            "employee_name": emp.name,
            "role": emp.role,
            "shift_counts": counts,
            "total_work_days": work_days,
            "total_off_days": counts["OFF"],
            "total_special_days": counts["SPECIAL"],
            "weekend_work_count": weekend_work,
            "max_consecutive_work": _max_consecutive_work(row),
            "consecutive_off_count": consec_off,
            "preferred_satisfied": _preferred_satisfied(emp, row),
        })

    # per_shift
    per_shift: dict[str, dict] = {}
    for s in WORK_SHIFTS:
        day_counts = [
            sum(1 for row in schedule.values() if row[d] == s)
            for d in range(num_days)
        ]
        total = sum(day_counts)
        per_shift[s] = {
            "total": total,
            "per_day_avg": round(total / num_days, 2) if num_days else 0,
            "min": min(day_counts) if day_counts else 0,
            "max": max(day_counts) if day_counts else 0,
        }

    # daily_coverage
    daily_coverage = []
    for d in range(num_days):
        day = d + 1
        c = {s: sum(1 for row in schedule.values() if row[d] == s) for s in WORK_SHIFTS}
        daily_coverage.append({
            "day": day,
            "weekday": date(year, month, day).weekday(),
            **c,
            "total": sum(c.values()),
        })

    # weekend_summary
    def _weekend_day(day):
        workers = []
        shifts = []
        for emp in employees:
            s = schedule.get(emp.name, [None] * num_days)[day - 1]
            if s in WORK_SHIFTS:
                workers.append(emp.name)
                shifts.append(s)
        return {"day": day, "workers": workers, "shifts": shifts}

    weekend_summary = {
        "saturdays": [_weekend_day(d) for d in saturdays],
        "sundays": [_weekend_day(d) for d in sundays],
    }

    # violations + solve meta
    report = schedule_service.get_validation_report(db, year, month)
    meta = _get_solve_meta(db, year, month)
    soft_stats = meta["soft_constraint_stats"]
    if soft_stats is None:
        soft_stats = {
            f"s{i}": report["per_rule_summary"].get(f"S{i}", {}).get("violations", 0)
            for i in range(1, 9)
        }

    has_data = any(
        any(s in WORK_SHIFTS for s in row)
        for row in schedule.values()
    )
    solve_status = meta["status"] or ("solved" if has_data else "no_data")

    total_shifts = sum(ps["total"] for ps in per_shift.values())

    return {
        "month_summary": {
            "year": year,
            "month": month,
            "num_days": num_days,
            "total_shifts": total_shifts,
            "solve_status": solve_status,
            "objective_value": meta["objective_value"],
            "solve_time": meta["solve_time"],
        },
        "per_employee": per_employee,
        "per_shift": per_shift,
        "daily_coverage": daily_coverage,
        "weekend_summary": weekend_summary,
        "violations_summary": report["summary"],
        "soft_constraint_stats": soft_stats,
    }
