import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import Employee, now_iso
from app.schemas.employee import (
    ROLE_DEFAULTS,
    EmployeeCreate,
    EmployeeUpdate,
)


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


def to_out(employee: Employee) -> dict:
    return {
        "id": employee.id,
        "name": employee.name,
        "nickname": employee.nickname,
        "tag": employee.tag,
        "sort_order": employee.sort_order,
        "role": employee.role,
        "available_shifts": _from_json(employee.available_shifts),
        "preferred_shift": employee.preferred_shift,
        "scheduling_mode": employee.scheduling_mode,
        "is_active": employee.is_active,
        "created_at": employee.created_at,
        "updated_at": employee.updated_at,
    }
