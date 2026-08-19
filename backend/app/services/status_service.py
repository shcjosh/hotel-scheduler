from sqlalchemy.orm import Session

from app.database.models import ScheduleStatus, now_iso

STATUSES = ("draft", "published", "locked")


def get_status(db: Session, year: int, month: int) -> str:
    rec = db.get(ScheduleStatus, (year, month))
    return rec.status if rec else "draft"


def set_status(db: Session, year: int, month: int, status: str) -> str:
    if status not in STATUSES:
        raise ValueError("無效狀態")
    rec = db.get(ScheduleStatus, (year, month))
    if rec is None:
        rec = ScheduleStatus(year=year, month=month, status=status)
        db.add(rec)
    else:
        rec.status = status
        rec.updated_at = now_iso()
    db.commit()
    return status


def publish(db: Session, year: int, month: int) -> str:
    set_status(db, year, month, "published")
    from app.services import snapshot_service

    snapshot_service.create_snapshot(db, year, month, name="正式發布版")
    return "published"


def lock(db: Session, year: int, month: int) -> str:
    return set_status(db, year, month, "locked")


def unlock(db: Session, year: int, month: int) -> str:
    return set_status(db, year, month, "draft")
