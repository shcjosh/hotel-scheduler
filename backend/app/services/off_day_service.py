import calendar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import DesignatedOffDay, Employee, ScheduleEntry, SpecialLeave
from app.scheduler.off_count import count_off_blocks


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
    """Return (run_count, run_days) where run_days are days in counted 連休 blocks.

    連休 = 連續非上班日（OFF + SPECIAL）長度 >=2 且含至少 1 天 OFF。
    """
    num_days = _num_days(year, month)
    designated, special, sched = _load_sets(db, emp_id, year, month)
    shifts = [_day_status(d, designated, special, sched) for d in range(1, num_days + 1)]
    count, run_days = count_off_blocks(shifts)
    return count, [d + 1 for d in run_days]


def get_off_days(db: Session, year: int, month: int) -> dict:
    designated: dict[int, list[int]] = {}
    for row in db.scalars(
        select(DesignatedOffDay).where(
            DesignatedOffDay.year == year, DesignatedOffDay.month == month
        )
    ):
        designated.setdefault(row.employee_id, []).append(row.day)

    special: dict[int, list[int]] = {}
    leave_details: dict[int, dict[int, str]] = {}
    for row in db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.year == year, SpecialLeave.month == month
        )
    ):
        special.setdefault(row.employee_id, []).append(row.day)
        leave_details.setdefault(row.employee_id, {})[row.day] = row.leave_type

    return {
        "designated_off_days": {
            str(k): sorted(v) for k, v in designated.items()
        },
        "special_leaves": {str(k): sorted(v) for k, v in special.items()},
        "leave_details": {
            str(k): {str(d): t for d, t in v.items()}
            for k, v in leave_details.items()
        },
    }


def get_off_day_summary(db: Session, year: int, month: int) -> dict:
    employees = list(
        db.scalars(
            select(Employee)
            .where(Employee.is_active == 1)
            .order_by(Employee.id)
        )
    )
    leave_by_emp: dict[int, dict[str, int]] = {}
    for row in db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.year == year, SpecialLeave.month == month
        )
    ):
        leave_by_emp.setdefault(row.employee_id, {}).setdefault(row.leave_type, 0)
        leave_by_emp[row.employee_id][row.leave_type] += 1

    summary: dict[str, dict] = {}
    for emp in employees:
        designated, special, _ = _load_sets(db, emp.id, year, month)
        count, run_days = count_consecutive_off(db, emp.id, year, month)
        leave_counts = leave_by_emp.get(emp.id, {})
        summary[str(emp.id)] = {
            "consecutive_off_count": count,
            "consecutive_off_days": run_days,
            "designated_count": len(designated),
            "special_count": len(special),
            "leave_type_counts": leave_counts,
            "total_leave_days": sum(leave_counts.values()),
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
        raise ValueError(f"連休每月最多 2 次（將造成 {count} 次）")
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
    db: Session, emp_id: int, year: int, month: int, day: int, leave_type: str = "SPECIAL"
) -> SpecialLeave:
    if db.get(Employee, emp_id) is None:
        raise ValueError("員工不存在")
    if day < 1 or day > _num_days(year, month):
        raise ValueError("日期無效")
    from app.database.models import LeaveType

    if db.get(LeaveType, leave_type) is None:
        raise ValueError("假別不存在")
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
        raise ValueError("該日已有請假記錄")
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
        raise ValueError("該日已為指定休假，無法設為請假")

    rec = SpecialLeave(
        employee_id=emp_id, year=year, month=month, day=day, leave_type=leave_type
    )
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
