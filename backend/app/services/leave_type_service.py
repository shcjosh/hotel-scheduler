import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import LeaveType, SpecialLeave

BUILTIN_LEAVE_TYPES = [
    ("SPECIAL", "特休", "#e1bee7", "#4a148c"),
    ("PERSONAL", "事假", "#ffe0b2", "#e65100"),
    ("SICK", "病假", "#cfd8dc", "#37474f"),
]


def ensure_defaults(db: Session) -> None:
    for code, name, bg, text in BUILTIN_LEAVE_TYPES:
        if db.get(LeaveType, code) is None:
            db.add(LeaveType(code=code, name=name, color_bg=bg, color_text=text, is_builtin=1))
    db.commit()


def list_leave_types(db: Session) -> list[LeaveType]:
    rows = list(
        db.scalars(select(LeaveType).where(LeaveType.is_active == 1))
    )
    builtin_order = {"SPECIAL": 0, "PERSONAL": 1, "SICK": 2}
    rows.sort(
        key=lambda lt: (0 if lt.is_builtin else 1, builtin_order.get(lt.code, 99), lt.code)
    )
    return rows


def get_leave_type(db: Session, code: str) -> LeaveType | None:
    return db.get(LeaveType, code)


def create_leave_type(db: Session, name: str, color_bg: str, color_text: str) -> LeaveType:
    name = (name or "").strip()
    if not name:
        raise ValueError("假別名稱不可為空")
    code = f"custom_{uuid.uuid4().hex[:10]}"
    rec = LeaveType(code=code, name=name, color_bg=color_bg, color_text=color_text, is_builtin=0)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def update_leave_type(
    db: Session,
    code: str,
    name: str | None = None,
    color_bg: str | None = None,
    color_text: str | None = None,
) -> LeaveType:
    rec = db.get(LeaveType, code)
    if rec is None:
        raise ValueError("假別不存在")
    if name is not None:
        rec.name = name.strip()
    if color_bg is not None:
        rec.color_bg = color_bg
    if color_text is not None:
        rec.color_text = color_text
    db.commit()
    db.refresh(rec)
    return rec


def delete_leave_type(db: Session, code: str) -> None:
    rec = db.get(LeaveType, code)
    if rec is None:
        raise ValueError("假別不存在")
    if rec.is_builtin:
        raise ValueError("內建假別不可刪除")
    used = db.scalars(
        select(SpecialLeave).where(SpecialLeave.leave_type == code).limit(1)
    ).first()
    if used is not None:
        raise ValueError("該假別已使用於班表，無法刪除")
    db.delete(rec)
    db.commit()
