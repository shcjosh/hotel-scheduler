from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.support import (
    SupportRequestCreate,
    SupportRequestResponse,
    SupportRequestUpdate,
)
from app.services import support_service

router = APIRouter()


@router.get(
    "/support-requests/{year}/{month}", response_model=list[SupportRequestResponse]
)
def list_support_requests(year: int, month: int, db: Session = Depends(get_db)):
    recs = support_service.get_support_requests(db, year, month)
    return [support_service._to_dict(r) for r in recs]


@router.post(
    "/support-requests",
    response_model=SupportRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_support_request(req: SupportRequestCreate, db: Session = Depends(get_db)):
    try:
        rec = support_service.create_support_request(
            db, req.year, req.month, req.day, req.shift, req.reason
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return support_service._to_dict(rec)


@router.put("/support-requests/{req_id}", response_model=SupportRequestResponse)
def update_support_request(
    req_id: int, req: SupportRequestUpdate, db: Session = Depends(get_db)
):
    try:
        rec = support_service.update_support_request(
            db, req_id, req.status, req.resolution
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return support_service._to_dict(rec)


@router.delete("/support-requests/{req_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_support_request(req_id: int, db: Session = Depends(get_db)):
    try:
        support_service.delete_support_request(db, req_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
