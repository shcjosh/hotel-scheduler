from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.cross_month import (
    CrossMonthPreviewResponse,
    CrossMonthResponse,
    CrossMonthSaveRequest,
)
from app.services import cross_month_service

router = APIRouter()


@router.get("/cross-month/{year}/{month}", response_model=CrossMonthResponse)
def get_cross_month(
    year: int,
    month: int,
    reload: bool = Query(False),
    db: Session = Depends(get_db),
):
    return cross_month_service.get_cross_month_links(db, year, month, reload=reload)


@router.post("/cross-month/{year}/{month}", response_model=CrossMonthResponse)
def save_cross_month(
    year: int, month: int, req: CrossMonthSaveRequest, db: Session = Depends(get_db)
):
    try:
        cross_month_service.save_cross_month_links(
            db,
            year,
            month,
            [link.model_dump() for link in req.links],
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return cross_month_service.get_cross_month_links(db, year, month)


@router.get(
    "/cross-month/preview/{year}/{month}", response_model=CrossMonthPreviewResponse
)
def get_cross_month_preview(year: int, month: int, db: Session = Depends(get_db)):
    return cross_month_service.get_cross_month_preview(db, year, month)
