from datetime import date

from sqlalchemy.orm import Session

from app.scheduler import data_loader, engine
from app.services import schedule_service, status_service

WORK_SHIFTS = ("A", "B", "C", "D", "M")


def _current_schedule(db: Session, data: data_loader.ShiftScheduleData) -> dict[str, list[str]]:
    return schedule_service.get_month_view(db, data.year, data.month, data.num_days)["schedule"]


def _validate(db: Session, data: data_loader.ShiftScheduleData, employee_id: int, days: list[int]) -> None:
    if status_service.get_status(db, data.year, data.month) == "locked":
        raise PermissionError("班表已鎖定，無法調整")
    emp = next((e for e in data.employees if e.id == employee_id), None)
    if emp is None:
        raise ValueError("員工不存在或已離職")
    if emp.role == "night":
        raise ValueError("大夜專職人員請至大夜班表頁面調整")
    for d in days:
        if d < 1 or d > data.num_days:
            raise ValueError(f"日期無效：{d}")
    today = date.today()
    if (today.year, today.month) == (data.year, data.month):
        for d in days:
            if d < today.day:
                raise ValueError("請假日期不可為過去日期")
    elif (today.year, today.month) > (data.year, data.month):
        raise ValueError("不可調整過去月份的班表")


def _diff(
    current: dict[str, list[str]],
    new: dict[str, list[str]],
    name_to_id: dict[str, int],
    leave_emp_id: int,
    leave_type: str,
) -> list[dict]:
    changes = []
    for name, new_row in new.items():
        emp_id = name_to_id.get(name)
        old_row = current.get(name)
        if old_row is None:
            continue
        for d, ns in enumerate(new_row):
            os_ = old_row[d] if d < len(old_row) else None
            if os_ != ns:
                changes.append({
                    "employee_id": emp_id,
                    "employee_name": name,
                    "day": d + 1,
                    "old_shift": os_,
                    "new_shift": ns,
                    "leave_type": leave_type if (ns == "SPECIAL" and emp_id == leave_emp_id) else None,
                })
    changes.sort(key=lambda c: (c["day"], c["employee_name"] or ""))
    return changes


def preview(db: Session, year: int, month: int, employee_id: int, days: list[int], leave_type: str) -> dict:
    data = data_loader.load(db, year, month)
    _validate(db, data, employee_id, days)

    leaves = set(data.special_leaves.get(employee_id, []))
    leaves.update(days)
    data.special_leaves[employee_id] = sorted(leaves)

    current = _current_schedule(db, data)
    name_to_id = {e.name: e.id for e in data.employees}
    result = engine.solve_adjust(data, current, employee_id, date.today())

    if not result.success:
        return {
            "success": False,
            "error": result.error,
            "diagnostics": result.diagnostics,
            "changes": [],
            "affected_employee_ids": [],
            "affected_count": 0,
        }

    changes = _diff(current, result.schedule, name_to_id, employee_id, leave_type)
    affected = sorted({c["employee_id"] for c in changes if c["employee_id"] != employee_id})
    return {
        "success": True,
        "schedule": result.schedule,
        "changes": changes,
        "affected_employee_ids": affected,
        "affected_count": len(affected),
        "solve_time": result.solve_time,
    }


def apply(db: Session, year: int, month: int, changes: list[dict], reason: str | None) -> dict:
    if status_service.get_status(db, year, month) == "locked":
        raise PermissionError("班表已鎖定，無法調整")
    applied = 0
    for c in changes:
        new_shift = c.get("new_shift")
        leave_type = c.get("leave_type") if new_shift == "SPECIAL" else None
        schedule_service.upsert_cell(
            db, c["employee_id"], year, month, c["day"], new_shift,
            leave_type=leave_type, reason=reason or "臨時異動",
        )
        applied += 1
    return {"applied": applied}
