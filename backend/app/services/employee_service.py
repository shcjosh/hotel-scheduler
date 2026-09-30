import json

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database.models import (
    AnnualLeaveAdjustment,
    AnnualLeaveManualEntry,
    DBackupRequest,
    DesignatedOffDay,
    Employee,
    NightRuleOverride,
    PreviousMonthLink,
    ScheduleEntry,
    SpecialLeave,
    now_iso,
)
from app.schemas.employee import (
    ROLE_DEFAULTS,
    EmployeeCreate,
    EmployeeUpdate,
)


def month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def visible_in_month_clause(year: int, month: int):
    """SQL filter：查詢該月份時可見的員工。

    已離職員工（resign_date 有值）在「最後上班月」及之前仍可見，
    該月之後不再出現。搭配 Employee.is_active == 1 使用。
    """
    return or_(
        Employee.resign_date.is_(None),
        func.substr(Employee.resign_date, 1, 7) >= month_key(year, month),
    )


def is_visible_in_month(emp: Employee, year: int, month: int) -> bool:
    if not emp.resign_date:
        return True
    return emp.resign_date[:7] >= month_key(year, month)


def is_schedulable_on(emp: Employee, year: int, month: int, day: int) -> bool:
    if not emp.resign_date:
        return True
    return f"{month_key(year, month)}-{day:02d}" <= emp.resign_date


def _to_json(shifts: list[str] | None) -> str:
    return json.dumps(shifts or [], ensure_ascii=False)


def _from_json(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def _apply_defaults(
    *,
    role: str,
    available_shifts: list[str] | None,
    preferred_shift: str | None,
    scheduling_mode: str | None,
) -> tuple[list[str], str | None, str]:
    defaults = ROLE_DEFAULTS.get(role, ROLE_DEFAULTS["general"])
    shifts = available_shifts if available_shifts is not None else defaults["available_shifts"]
    pref = preferred_shift if preferred_shift is not None else defaults["preferred_shift"]
    mode = scheduling_mode or defaults["scheduling_mode"]
    if pref is not None and pref not in shifts:
        raise ValueError(f"preferred_shift '{pref}' not in available_shifts")
    return shifts, pref, mode


def list_employees(db: Session, *, include_inactive: bool = False) -> list[Employee]:
    stmt = select(Employee)
    if not include_inactive:
        stmt = stmt.where(Employee.is_active == 1)
    return list(db.scalars(stmt.order_by(Employee.sort_order.asc(), Employee.id.asc())))


def get_employee(db: Session, employee_id: int) -> Employee | None:
    return db.get(Employee, employee_id)


def create_employee(db: Session, data: EmployeeCreate) -> Employee:
    shifts, pref, mode = _apply_defaults(
        role=data.role,
        available_shifts=data.available_shifts,
        preferred_shift=data.preferred_shift,
        scheduling_mode=data.scheduling_mode,
    )
    if data.sort_order is None:
        max_order = db.scalar(
            select(Employee.sort_order).order_by(Employee.sort_order.desc()).limit(1)
        ) or 0
        sort_order = max_order + 1
    else:
        sort_order = data.sort_order
    employee = Employee(
        name=data.name,
        nickname=data.nickname or None,
        tag=data.tag or None,
        resign_date=data.resign_date or None,
        hire_date=data.hire_date or None,
        sort_order=sort_order,
        role=data.role,
        available_shifts=_to_json(shifts),
        preferred_shift=pref,
        scheduling_mode=mode,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def update_employee(db: Session, employee: Employee, data: EmployeeUpdate) -> Employee:
    payload = data.model_dump(exclude_unset=True)

    if "role" in payload:
        employee.role = payload["role"]

    defaults = ROLE_DEFAULTS.get(employee.role, ROLE_DEFAULTS["general"])

    if "available_shifts" in payload:
        shifts = payload["available_shifts"]
    elif "role" in payload:
        shifts = defaults["available_shifts"]
    else:
        shifts = _from_json(employee.available_shifts)

    if "preferred_shift" in payload:
        pref = payload["preferred_shift"]
    elif "role" in payload:
        pref = defaults["preferred_shift"]
    else:
        pref = employee.preferred_shift

    if "scheduling_mode" in payload:
        mode = payload["scheduling_mode"]
    elif "role" in payload:
        mode = defaults["scheduling_mode"]
    else:
        mode = employee.scheduling_mode

    if pref is not None and pref not in shifts:
        raise ValueError(f"preferred_shift '{pref}' not in available_shifts")

    if "name" in payload:
        employee.name = payload["name"]
    if "nickname" in payload:
        employee.nickname = payload["nickname"] or None
    if "tag" in payload:
        employee.tag = payload["tag"] or None
    if "hire_date" in payload:
        employee.hire_date = payload["hire_date"] or None
    if "resign_date" in payload:
        employee.resign_date = payload["resign_date"] or None
        # 設定/取消離職即代表要保留並管理此員工；若之前是軟刪除狀態則一併復原，
        # 讓歷史班表重新可見。
        if "is_active" not in payload:
            employee.is_active = 1
    if "sort_order" in payload and payload["sort_order"] is not None:
        employee.sort_order = payload["sort_order"]
    if "is_active" in payload:
        employee.is_active = payload["is_active"]

    employee.available_shifts = _to_json(shifts)
    employee.preferred_shift = pref
    employee.scheduling_mode = mode
    employee.updated_at = now_iso()
    db.commit()
    db.refresh(employee)
    return employee


def reorder_employees(db: Session, employee_ids: list[int]) -> list[Employee]:
    for idx, eid in enumerate(employee_ids):
        emp = db.get(Employee, eid)
        if emp:
            emp.sort_order = idx + 1
            emp.updated_at = now_iso()
    db.commit()
    return list_employees(db)


def soft_delete_employee(db: Session, employee: Employee) -> Employee:
    employee.is_active = 0
    employee.updated_at = now_iso()
    db.commit()
    db.refresh(employee)
    return employee


def has_history(db: Session, employee_id: int) -> bool:
    """是否有任何班表/休假/跨月/大夜規則等歷史資料。"""
    checks = [
        select(ScheduleEntry.id).where(ScheduleEntry.employee_id == employee_id).limit(1),
        select(DesignatedOffDay.id).where(DesignatedOffDay.employee_id == employee_id).limit(1),
        select(SpecialLeave.id).where(SpecialLeave.employee_id == employee_id).limit(1),
        select(PreviousMonthLink.id).where(PreviousMonthLink.employee_id == employee_id).limit(1),
        select(NightRuleOverride.id).where(NightRuleOverride.employee_id == employee_id).limit(1),
        select(DBackupRequest.id).where(DBackupRequest.assigned_employee_id == employee_id).limit(1),
        select(AnnualLeaveAdjustment.id).where(AnnualLeaveAdjustment.employee_id == employee_id).limit(1),
        select(AnnualLeaveManualEntry.id).where(AnnualLeaveManualEntry.employee_id == employee_id).limit(1),
    ]
    return any(db.scalars(stmt).first() is not None for stmt in checks)


def hard_delete_employee(db: Session, employee: Employee) -> None:
    """真正刪除員工。僅限沒有任何歷史資料者，避免砍掉歷史班表。"""
    if has_history(db, employee.id):
        raise ValueError("此員工已有班表/休假等歷史資料，請改用「設離職」保留歷史")
    db.delete(employee)
    db.commit()


def to_out(employee: Employee) -> dict:
    return {
        "id": employee.id,
        "name": employee.name,
        "nickname": employee.nickname,
        "tag": employee.tag,
        "resign_date": employee.resign_date,
        "hire_date": employee.hire_date,
        "sort_order": employee.sort_order,
        "role": employee.role,
        "available_shifts": _from_json(employee.available_shifts),
        "preferred_shift": employee.preferred_shift,
        "scheduling_mode": employee.scheduling_mode,
        "is_active": employee.is_active,
        "created_at": employee.created_at,
        "updated_at": employee.updated_at,
    }
