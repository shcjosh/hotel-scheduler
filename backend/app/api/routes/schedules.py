import calendar

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.database.models import Employee
from app.schemas.schedule import (
    MonthScheduleView,
    ScheduleEntryCreate,
    ScheduleEntryOut,
    ScheduleEntryUpdate,
)
from app.services import schedule_service

router = APIRouter()


def _validate_employee(db: Session, employee_id: int) -> None:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {employee_id} not found",
        )


@router.get("/schedules/{year}/{month}", response_model=MonthScheduleView)
def get_month_schedule(year: int, month: int, db: Session = Depends(get_db)):
    num_days = calendar.monthrange(year, month)[1]
    schedule = schedule_service.get_month_view(db, year, month, num_days)
    return MonthScheduleView(
        year=year, month=month, num_days=num_days, schedule=schedule
    )


@router.get("/schedule-entries", response_model=list[ScheduleEntryOut])
def list_entries(
    employee_id: int | None = Query(None),
    year: int | None = Query(None),
    month: int | None = Query(None),
    day: int | None = Query(None),
    db: Session = Depends(get_db),
):
    return schedule_service.list_entries(
        db, employee_id=employee_id, year=year, month=month, day=day
    )


@router.post(
    "/schedule-entries",
    response_model=ScheduleEntryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_entry(data: ScheduleEntryCreate, db: Session = Depends(get_db)):
    _validate_employee(db, data.employee_id)
    try:
        return schedule_service.create_entry(db, data)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Schedule entry already exists for this employee and date",
        )


@router.get("/schedule-entries/{entry_id}", response_model=ScheduleEntryOut)
def get_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = schedule_service.get_entry(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return entry


@router.put("/schedule-entries/{entry_id}", response_model=ScheduleEntryOut)
def update_entry(entry_id: int, data: ScheduleEntryUpdate, db: Session = Depends(get_db)):
    entry = schedule_service.get_entry(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return schedule_service.update_entry(db, entry, data)


@router.delete("/schedule-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = schedule_service.get_entry(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    schedule_service.delete_entry(db, entry)
