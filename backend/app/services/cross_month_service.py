import calendar
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database.models import Employee, PreviousMonthLink, ScheduleEntry

VALID_SHIFTS = {"A", "B", "C", "D", "M", "OFF", "SPECIAL", None}
WORK_SHIFTS = {"A", "B", "C", "D", "M"}


def _not_support():
    """二館支援（帶 tag）為外部手動排班、豁免所有規則，不納入跨月銜接。"""
    return (Employee.tag.is_(None)) | (Employee.tag == "")


def _prev_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def get_cross_month_links(
    db: Session, year: int, month: int, reload: bool = False
) -> dict:
    if reload:
        auto_load_from_prev_month(db, year, month)

    links = list(
        db.scalars(
            select(PreviousMonthLink)
            .join(Employee, Employee.id == PreviousMonthLink.employee_id)
            .where(
                PreviousMonthLink.year == year,
                PreviousMonthLink.month == month,
                _not_support(),
            )
        )
    )
    result: dict[str, dict] = {}
    for link in links:
        result[str(link.employee_id)] = {
            "employee_id": link.employee_id,
            "day_5_shift": link.day_5_shift,
            "day_4_shift": link.day_4_shift,
            "day_3_shift": link.day_3_shift,
            "day_2_shift": link.day_2_shift,
            "day_1_shift": link.day_1_shift,
            "source": link.source,
        }

    prev_year, prev_month = _prev_month(year, month)
    prev_num_days = calendar.monthrange(prev_year, prev_month)[1]
    last5 = list(range(prev_num_days - 4, prev_num_days + 1))
    dates = [f"{prev_month}/{d}" for d in last5]

    return {
        "previous_month_links": result,
        "prev_month_name": f"{prev_year}年{prev_month}月",
        "prev_last_5_dates": dates,
    }


def auto_load_from_prev_month(db: Session, year: int, month: int) -> bool:
    prev_year, prev_month = _prev_month(year, month)
    prev_num_days = calendar.monthrange(prev_year, prev_month)[1]
    last5 = list(range(prev_num_days - 4, prev_num_days + 1))

    entries = list(
        db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.year == prev_year,
                ScheduleEntry.month == prev_month,
                ScheduleEntry.day.in_(last5),
            )
        )
    )
    by_emp_day: dict[tuple[int, int], str] = {
        (e.employee_id, e.day): e.shift for e in entries
    }
    has_any = len(entries) > 0

    db.execute(
        delete(PreviousMonthLink).where(
            PreviousMonthLink.year == year, PreviousMonthLink.month == month
        )
    )

    if has_any:
        employees = list(
            db.scalars(
                select(Employee)
                .where(Employee.is_active == 1, _not_support())
                .order_by(Employee.id)
            )
        )
        for emp in employees:
            shifts = [by_emp_day.get((emp.id, d)) for d in last5]
            db.add(
                PreviousMonthLink(
                    employee_id=emp.id,
                    year=year,
                    month=month,
                    day_5_shift=shifts[0],
                    day_4_shift=shifts[1],
                    day_3_shift=shifts[2],
                    day_2_shift=shifts[3],
                    day_1_shift=shifts[4],
                    source="auto",
                )
            )
    db.commit()
    return has_any


def save_cross_month_links(
    db: Session, year: int, month: int, links: list[dict]
) -> None:
    valid_links: list[dict] = []
    for link in links:
        emp = db.get(Employee, link["employee_id"])
        if emp is None:
            raise ValueError(f"員工不存在：{link['employee_id']}")
        if emp.tag:
            continue
        shifts = [
            link.get("day_5_shift"),
            link.get("day_4_shift"),
            link.get("day_3_shift"),
            link.get("day_2_shift"),
            link.get("day_1_shift"),
        ]
        for s in shifts:
            if s not in VALID_SHIFTS:
                raise ValueError(f"無效班次：{s}")
        valid_links.append(link)

    db.execute(
        delete(PreviousMonthLink).where(
            PreviousMonthLink.year == year, PreviousMonthLink.month == month
        )
    )
    for link in valid_links:
        db.add(
            PreviousMonthLink(
                employee_id=link["employee_id"],
                year=year,
                month=month,
                day_5_shift=link.get("day_5_shift"),
                day_4_shift=link.get("day_4_shift"),
                day_3_shift=link.get("day_3_shift"),
                day_2_shift=link.get("day_2_shift"),
                day_1_shift=link.get("day_1_shift"),
                source="manual",
            )
        )
    db.commit()


def get_cross_month_preview(db: Session, year: int, month: int) -> dict:
    links = {
        link.employee_id: link
        for link in db.scalars(
            select(PreviousMonthLink).where(
                PreviousMonthLink.year == year, PreviousMonthLink.month == month
            )
        )
    }
    employees = list(
        db.scalars(
            select(Employee)
            .where(Employee.is_active == 1, _not_support())
            .order_by(Employee.id)
        )
    )
    emp_by_id = {e.id: e for e in employees}

    curr_day1 = {
        e.employee_id: e.shift
        for e in db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.year == year,
                ScheduleEntry.month == month,
                ScheduleEntry.day == 1,
            )
        )
    }

    weekday_day1 = date(year, month, 1).weekday()
    prev_year, prev_month = _prev_month(year, month)
    last_date_str = f"{prev_month}/{calendar.monthrange(prev_year, prev_month)[1]}"

    violations: list[dict] = []
    week_summary: list[dict] = []

    for emp in employees:
        link = links.get(emp.id)
        if link is None:
            continue
        prev_shifts = [
            link.day_5_shift,
            link.day_4_shift,
            link.day_3_shift,
            link.day_2_shift,
            link.day_1_shift,
        ]
        c1 = curr_day1.get(emp.id)
        is_night = emp.role == "night"

        prev_day1 = link.day_1_shift
        if not is_night and prev_day1 == "C":
            if c1 == "A":
                violations.append(_v(emp, "shift_transition", "H5",
                    f"{last_date_str} C → {month}/1 A 違規：C 班隔天不可接 A 班"))
            elif c1 is None:
                violations.append(_v(emp, "shift_transition", "H5",
                    f"{last_date_str} 為 C 班，{month}/1 不可排 A 班"))
        elif not is_night and prev_day1 == "D":
            if c1 == "A":
                violations.append(_v(emp, "shift_transition", "H5",
                    f"{last_date_str} D → {month}/1 A 違規：D 班隔天不可接 A 班"))
            elif c1 == "C":
                violations.append(_v(emp, "shift_transition", "H5",
                    f"{last_date_str} D → {month}/1 C 違規：D 班隔天不可接 C 班"))
            elif c1 == "M":
                violations.append(_v(emp, "shift_transition", "H5",
                    f"{last_date_str} D → {month}/1 M 違規：D 班隔天不可接 M 班"))
            elif c1 is None:
                violations.append(_v(emp, "shift_transition", "H5",
                    f"{last_date_str} 為 D 班，{month}/1 不可排 A、C、M 班"))

        consec = 0
        for s in reversed(prev_shifts):
            if s in WORK_SHIFTS:
                consec += 1
            else:
                break
        if not is_night and consec >= 5:
            if c1 in WORK_SHIFTS:
                violations.append(_v(emp, "consecutive_work", "H4",
                    f"上月最後 5 天連續上班，{month}/1 必須休假"))
            elif c1 is None:
                violations.append(_v(emp, "consecutive_work", "H4",
                    f"上月最後 5 天連續上班，{month}/1 必須休假"))

        prev_off = 0
        for j in range(1, min(weekday_day1, 5) + 1):
            if prev_shifts[-j] == "OFF":
                prev_off += 1
        remaining = max(0, 2 - prev_off)
        week_summary.append(
            {
                "employee_id": emp.id,
                "employee_name": emp.name,
                "prev_week_off_count": prev_off,
                "curr_week_off_count": None,
                "remaining_off": remaining,
                "at_limit": prev_off >= 2,
            }
        )

    return {"violations": violations, "cross_month_week_summary": week_summary}


def _v(emp: Employee, vtype: str, rule: str, message: str) -> dict:
    return {
        "employee_id": emp.id,
        "employee_name": emp.name,
        "type": vtype,
        "rule": rule,
        "message": message,
    }
