from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.annual_leave import AdjustmentUpsertRequest, ManualEntryCreateRequest
from app.services import annual_leave_service

router = APIRouter()


@router.get("/annual-leave/{year}/{month}")
def get_annual_leave(year: int, month: int, db: Session = Depends(get_db)):
    return annual_leave_service.get_month_summary(db, year, month)


@router.put("/annual-leave/adjustment")
def upsert_adjustment(req: AdjustmentUpsertRequest, db: Session = Depends(get_db)):
    try:
        rec = annual_leave_service.upsert_adjustment(
            db,
            req.employee_id,
            req.period_start,
            req.opening_used_days,
            req.entitlement_override,
            req.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {
        "id": rec.id,
        "employee_id": rec.employee_id,
        "period_start": rec.period_start,
        "opening_used_days": rec.opening_used_days,
        "entitlement_override": rec.entitlement_override,
        "note": rec.note,
    }


@router.post(
    "/annual-leave/manual-entries", status_code=status.HTTP_201_CREATED
)
def add_manual_entry(req: ManualEntryCreateRequest, db: Session = Depends(get_db)):
    try:
        rec = annual_leave_service.add_manual_entry(
            db, req.employee_id, req.date, req.days, req.note
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {
        "id": rec.id,
        "employee_id": rec.employee_id,
        "date": rec.entry_date,
        "days": rec.days,
        "note": rec.note,
    }


@router.delete(
    "/annual-leave/manual-entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_manual_entry(entry_id: int, db: Session = Depends(get_db)):
    try:
        annual_leave_service.delete_manual_entry(db, entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return None
