import calendar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import DesignatedOffDay, Employee, ScheduleEntry, SpecialLeave


def _num_days(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _day_status(
    day: int,
    designated: set[int],
    special: set[int],
    sched: dict[int, str],
) -> str | None:
    if day in special:
        return "SPECIAL"
    if day in designated:
        return "OFF"
    return sched.get(day)


def _load_sets(
    db: Session, emp_id: int, year: int, month: int
) -> tuple[set[int], set[int], dict[int, str]]:
    designated = set(
        db.scalars(
            select(DesignatedOffDay.day).where(
                DesignatedOffDay.employee_id == emp_id,
                DesignatedOffDay.year == year,
                DesignatedOffDay.month == month,
            )
        )
    )
    special = set(
        db.scalars(
            select(SpecialLeave.day).where(
                SpecialLeave.employee_id == emp_id,
                SpecialLeave.year == year,
                SpecialLeave.month == month,
            )
        )
    )
    sched = {
        e.day: e.shift
        for e in db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.employee_id == emp_id,
                ScheduleEntry.year == year,
                ScheduleEntry.month == month,
            )
        )
    }
    return designated, special, sched


def count_consecutive_off(
    db: Session, emp_id: int, year: int, month: int
) -> tuple[int, list[int]]:
    """Return (run_count, run_days) where run_days are days in >=2 OFF runs.

    OFF (general rest + designated) participates; SPECIAL and work break the run.
    """
    num_days = _num_days(year, month)
    designated, special, sched = _load_sets(db, emp_id, year, month)

    count = 0
    run_days: list[int] = []
    current: list[int] = []
    for day in range(1, num_days + 1):
        status = _day_status(day, designated, special, sched)
        if status == "OFF":
            current.append(day)
        else:
            if len(current) >= 2:
                count += 1
                run_days.extend(current)
            current = []
    if len(current) >= 2:
        count += 1
        run_days.extend(current)
    return count, run_days


def get_off_days(db: Session, year: int, month: int) -> dict:
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

    return {
        "designated_off_days": {
            str(k): sorted(v) for k, v in designated.items()
        },
        "special_leaves": {str(k): sorted(v) for k, v in special.items()},
    }


def get_off_day_summary(db: Session, year: int, month: int) -> dict:
    employees = list(
        db.scalars(
            select(Employee)
            .where(Employee.is_active == 1)
            .order_by(Employee.id)
        )
    )
    summary: dict[str, dict] = {}
    for emp in employees:
        designated, special, _ = _load_sets(db, emp.id, year, month)
        count, run_days = count_consecutive_off(db, emp.id, year, month)
        summary[str(emp.id)] = {
            "consecutive_off_count": count,
            "consecutive_off_days": run_days,
            "designated_count": len(designated),
            "special_count": len(special),
        }
    return summary


def add_designated_off(
    db: Session, emp_id: int, year: int, month: int, day: int
) -> DesignatedOffDay:
    if db.get(Employee, emp_id) is None:
        raise ValueError("員工不存在")
    if day < 1 or day > _num_days(year, month):
        raise ValueError("日期無效")

    existing = list(
        db.scalars(
            select(DesignatedOffDay).where(
                DesignatedOffDay.employee_id == emp_id,
                DesignatedOffDay.year == year,
                DesignatedOffDay.month == month,
            )
        )
    )
    if any(d.day == day for d in existing):
        raise ValueError("該日已為指定休假")
    if len(existing) >= 2:
        raise ValueError("指定休假每月最多 2 天")
    if (
        db.scalars(
            select(SpecialLeave).where(
                SpecialLeave.employee_id == emp_id,
                SpecialLeave.year == year,
                SpecialLeave.month == month,
                SpecialLeave.day == day,
            )
        ).first()
        is not None
    ):
        raise ValueError("該日已為特休，無法設為指定休假")

    rec = DesignatedOffDay(
        employee_id=emp_id, year=year, month=month, day=day
    )
    db.add(rec)
    db.flush()
    count, _ = count_consecutive_off(db, emp_id, year, month)
    if count > 2:
        db.rollback()
        raise ValueError(f"連休 2 日每月最多 2 次（將造成 {count} 次）")
    db.commit()
    db.refresh(rec)
    return rec


def remove_designated_off(
    db: Session, emp_id: int, year: int, month: int, day: int
) -> None:
    rec = db.scalars(
        select(DesignatedOffDay).where(
            DesignatedOffDay.employee_id == emp_id,
            DesignatedOffDay.year == year,
            DesignatedOffDay.month == month,
            DesignatedOffDay.day == day,
        )
    ).first()
    if rec is None:
        raise ValueError("該日無指定休假")
    db.delete(rec)
    db.commit()


def add_special_leave(
    db: Session, emp_id: int, year: int, month: int, day: int
) -> SpecialLeave:
    if db.get(Employee, emp_id) is None:
        raise ValueError("員工不存在")
    if day < 1 or day > _num_days(year, month):
        raise ValueError("日期無效")
    if (
        db.scalars(
            select(SpecialLeave).where(
                SpecialLeave.employee_id == emp_id,
                SpecialLeave.year == year,
                SpecialLeave.month == month,
                SpecialLeave.day == day,
            )
        ).first()
        is not None
    ):
        raise ValueError("該日已為特休")
    if (
        db.scalars(
            select(DesignatedOffDay).where(
                DesignatedOffDay.employee_id == emp_id,
                DesignatedOffDay.year == year,
                DesignatedOffDay.month == month,
                DesignatedOffDay.day == day,
            )
        ).first()
        is not None
    ):
        raise ValueError("該日已為指定休假，無法設為特休")

    rec = SpecialLeave(employee_id=emp_id, year=year, month=month, day=day)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def remove_special_leave(
    db: Session, emp_id: int, year: int, month: int, day: int
) -> None:
    rec = db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.employee_id == emp_id,
            SpecialLeave.year == year,
            SpecialLeave.month == month,
            SpecialLeave.day == day,
        )
    ).first()
    if rec is None:
        raise ValueError("該日無特休")
    db.delete(rec)
    db.commit()
