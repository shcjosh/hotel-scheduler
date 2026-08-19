from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.schedule_meta import (
    ChangeLogOut,
    SnapshotCreateRequest,
    SnapshotOut,
    StatusUpdateRequest,
)
from app.services import change_log_service, snapshot_service, status_service

router = APIRouter()


@router.get("/schedule-status/{year}/{month}")
def get_schedule_status(year: int, month: int, db: Session = Depends(get_db)):
    return {
        "year": year,
        "month": month,
        "status": status_service.get_status(db, year, month),
    }


@router.put("/schedule-status/{year}/{month}")
def set_schedule_status(
    year: int, month: int, req: StatusUpdateRequest, db: Session = Depends(get_db)
):
    try:
        if req.status == "published":
            status_service.publish(db, year, month)
        else:
            status_service.set_status(db, year, month, req.status)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"year": year, "month": month, "status": req.status}


@router.get("/snapshots/{year}/{month}", response_model=list[SnapshotOut])
def list_snapshots(year: int, month: int, db: Session = Depends(get_db)):
    return snapshot_service.list_snapshots(db, year, month)


@router.post(
    "/snapshots/{year}/{month}",
    response_model=SnapshotOut,
    status_code=status.HTTP_201_CREATED,
)
def create_snapshot(
    year: int, month: int, req: SnapshotCreateRequest, db: Session = Depends(get_db)
):
    return snapshot_service.create_snapshot(db, year, month, name=req.name)


@router.post("/snapshots/{snapshot_id}/restore", response_model=SnapshotOut)
def restore_snapshot(snapshot_id: int, db: Session = Depends(get_db)):
    try:
        return snapshot_service.restore_snapshot(db, snapshot_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/snapshots/diff/{snapshot_id_a}/{snapshot_id_b}")
def diff_snapshots(
    snapshot_id_a: int, snapshot_id_b: int, db: Session = Depends(get_db)
):
    try:
        return snapshot_service.diff_snapshots(db, snapshot_id_a, snapshot_id_b)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/change-logs/{year}/{month}", response_model=list[ChangeLogOut])
def list_change_logs(year: int, month: int, db: Session = Depends(get_db)):
    return change_log_service.list_change_logs(db, year, month)
