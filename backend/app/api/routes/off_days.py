from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.off_days import (
    EmployeeOffSummary,
    OffDayRequest,
    OffDayResponse,
    OffDaySummaryResponse,
)
from app.services import off_day_service

router = APIRouter()


@router.get("/off-days/{year}/{month}", response_model=OffDayResponse)
def get_off_days(year: int, month: int, db: Session = Depends(get_db)):
    return off_day_service.get_off_days(db, year, month)


@router.get(
    "/off-days/summary/{year}/{month}", response_model=OffDaySummaryResponse
)
def get_off_day_summary(year: int, month: int, db: Session = Depends(get_db)):
    summary = off_day_service.get_off_day_summary(db, year, month)
    return {
        k: EmployeeOffSummary(**v) for k, v in summary.items()
    }


@router.post("/off-days/designated", status_code=status.HTTP_201_CREATED)
def add_designated_off(
    req: OffDayRequest, db: Session = Depends(get_db)
):
    try:
        off_day_service.add_designated_off(
            db, req.employee_id, req.year, req.month, req.day
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {
        "employee_id": req.employee_id,
        "year": req.year,
        "month": req.month,
        "day": req.day,
    }


@router.delete(
    "/off-days/designated/{employee_id}/{year}/{month}/{day}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_designated_off(
    employee_id: int, year: int, month: int, day: int, db: Session = Depends(get_db)
):
    try:
        off_day_service.remove_designated_off(db, employee_id, year, month, day)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/off-days/special", status_code=status.HTTP_201_CREATED)
def add_special_leave(req: OffDayRequest, db: Session = Depends(get_db)):
    try:
        off_day_service.add_special_leave(
            db, req.employee_id, req.year, req.month, req.day, req.leave_type
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {
        "employee_id": req.employee_id,
        "year": req.year,
        "month": req.month,
        "day": req.day,
        "leave_type": req.leave_type,
    }


@router.delete(
    "/off-days/special/{employee_id}/{year}/{month}/{day}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_special_leave(
    employee_id: int, year: int, month: int, day: int, db: Session = Depends(get_db)
):
    try:
        off_day_service.remove_special_leave(db, employee_id, year, month, day)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
