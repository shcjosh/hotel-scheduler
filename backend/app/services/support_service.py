from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.models import SupportRequest, now_iso


def get_support_requests(db: Session, year: int, month: int) -> list[SupportRequest]:
    return list(
        db.scalars(
            select(SupportRequest)
            .where(SupportRequest.year == year, SupportRequest.month == month)
            .order_by(SupportRequest.day, SupportRequest.shift)
        )
    )


def create_support_request(
    db: Session,
    year: int,
    month: int,
    day: int,
    shift: str,
    reason: str | None = None,
    source: str = "manual",
) -> SupportRequest:
    if shift not in ("A", "C"):
        raise ValueError("支援請求班次只能為 A 或 C")
    rec = SupportRequest(
        year=year, month=month, day=day, shift=shift,
        reason=reason, source=source,
    )
    db.add(rec)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ValueError("該日該班次已有支援請求")
    db.refresh(rec)
    return rec


def update_support_request(
    db: Session, req_id: int, status: str, resolution: str | None = None
) -> SupportRequest:
    if status not in ("open", "resolved", "ignored"):
        raise ValueError("狀態只能為 open/resolved/ignored")
    rec = db.get(SupportRequest, req_id)
    if rec is None:
        raise ValueError("支援請求不存在")
    rec.status = status
    rec.resolution = resolution
    if status in ("resolved", "ignored"):
        rec.resolved_at = now_iso()
    db.commit()
    db.refresh(rec)
    return rec


def delete_support_request(db: Session, req_id: int) -> None:
    rec = db.get(SupportRequest, req_id)
    if rec is None:
        raise ValueError("支援請求不存在")
    db.delete(rec)
    db.commit()


def auto_generate_from_diagnostics(
    db: Session, diagnostics: dict | None, year: int, month: int
) -> list[dict]:
    """Create support requests from solve-failure diagnostics (coverage gaps)."""
    if not diagnostics:
        return []
    created = []
    for cause in diagnostics.get("likely_causes", []):
        if cause.get("type") != "coverage_gap":
            continue
        msg = cause.get("message", "")
        for shift in ("A", "C"):
            if f"{shift} 班" in msg or f"{shift}班" in msg:
                try:
                    rec = create_support_request(
                        db, year, month, 0, shift,
                        reason=cause.get("message"), source="auto",
                    )
                    created.append(_to_dict(rec))
                except ValueError:
                    pass
    return created


def _to_dict(rec: SupportRequest) -> dict:
    return {
        "id": rec.id,
        "year": rec.year,
        "month": rec.month,
        "day": rec.day,
        "shift": rec.shift,
        "reason": rec.reason,
        "status": rec.status,
        "resolution": rec.resolution,
        "source": rec.source,
        "created_at": rec.created_at,
        "resolved_at": rec.resolved_at,
    }
