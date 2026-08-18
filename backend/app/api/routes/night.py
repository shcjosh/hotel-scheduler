from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.night import (
    BackupRequestRequest,
    BackupRequestResponse,
    NightDeleteRequest,
    NightEntryRequest,
    NightScheduleResponse,
    NightValidationResponse,
)
from app.services import night_service

router = APIRouter()


@router.post(
    "/night/backup-request",
    response_model=BackupRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_backup_request(req: BackupRequestRequest, db: Session = Depends(get_db)):
    try:
        rec = night_service.add_backup_request(db, req.year, req.month, req.day)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return BackupRequestResponse(
        id=rec.id,
        year=rec.year,
        month=rec.month,
        day=rec.day,
        status=rec.status,
        assigned_employee_id=rec.assigned_employee_id,
    )


@router.get("/night/backup-requests/{year}/{month}", response_model=list[BackupRequestResponse])
def list_backup_requests(year: int, month: int, db: Session = Depends(get_db)):
    recs = night_service.get_backup_requests(db, year, month)
    return [
        BackupRequestResponse(
            id=r.id, year=r.year, month=r.month, day=r.day,
            status=r.status, assigned_employee_id=r.assigned_employee_id,
        )
        for r in recs
    ]


@router.delete("/night/backup-request/{req_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_backup_request(req_id: int, db: Session = Depends(get_db)):
    try:
        night_service.remove_backup_request(db, req_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/night/{year}/{month}/validation", response_model=NightValidationResponse)
def validate_night(year: int, month: int, db: Session = Depends(get_db)):
    return night_service.validate_night_schedule(db, year, month)


@router.get("/night/{year}/{month}/rule-overrides")
def get_rule_overrides(year: int, month: int, db: Session = Depends(get_db)):
    return night_service.get_rule_overrides(db)


@router.put("/night/rule-overrides/{employee_id}")
def update_rule_overrides(employee_id: int, req: dict, db: Session = Depends(get_db)):
    return night_service.update_rule_overrides(db, employee_id, req)


@router.get("/night/{year}/{month}", response_model=NightScheduleResponse)
def get_night_schedule(year: int, month: int, db: Session = Depends(get_db)):
    return night_service.get_night_schedule(db, year, month)


@router.put("/night/{year}/{month}/{day}", response_model=NightScheduleResponse)
def save_night_entry(
    year: int, month: int, day: int,
    req: NightEntryRequest, db: Session = Depends(get_db),
):
    try:
        night_service.save_night_entry(db, req.employee_id, year, month, day, req.shift)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return night_service.get_night_schedule(db, year, month)


@router.delete("/night/{year}/{month}", status_code=status.HTTP_200_OK)
def clear_night_schedule(year: int, month: int, db: Session = Depends(get_db)):
    cleared = night_service.clear_night_schedule(db, year, month)
    return {"cleared": cleared}


@router.delete("/night/{year}/{month}/{day}", response_model=NightScheduleResponse)
def delete_night_entry(
    year: int, month: int, day: int,
    req: NightDeleteRequest, db: Session = Depends(get_db),
):
    try:
        night_service.delete_night_entry(db, req.employee_id, year, month, day)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return night_service.get_night_schedule(db, year, month)
