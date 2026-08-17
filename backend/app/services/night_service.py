import dataclasses

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.models import DBackupRequest, Employee, ScheduleEntry
from app.scheduler import data_loader, validator


def get_night_schedule(db: Session, year: int, month: int) -> dict:
    night_emps = list(
        db.scalars(
            select(Employee)
            .where(Employee.is_active == 1, Employee.role == "night")
            .order_by(Employee.id)
        )
    )
    night_ids = [e.id for e in night_emps]

    schedule: dict[str, dict[str, str]] = {}
    if night_ids:
        entries = list(
            db.scalars(
                select(ScheduleEntry).where(
                    ScheduleEntry.employee_id.in_(night_ids),
                    ScheduleEntry.year == year,
                    ScheduleEntry.month == month,
                    ScheduleEntry.source == "night_input",
                )
            )
        )
        for e in entries:
            schedule.setdefault(str(e.employee_id), {})[str(e.day)] = e.shift

    backups = list(
        db.scalars(
            select(DBackupRequest).where(
                DBackupRequest.year == year, DBackupRequest.month == month
            ).order_by(DBackupRequest.day)
        )
    )
    return {
        "night_schedule": schedule,
        "night_employees": [{"id": e.id, "name": e.name} for e in night_emps],
        "d_backup_requests": [
            {
                "id": b.id,
                "year": b.year,
                "month": b.month,
                "day": b.day,
                "status": b.status,
                "assigned_employee_id": b.assigned_employee_id,
            }
            for b in backups
        ],
    }


def save_night_entry(
    db: Session, emp_id: int, year: int, month: int, day: int, shift: str
) -> None:
    if shift not in ("D", "OFF"):
        raise ValueError("大夜班次只能為 D 或 OFF")
    emp = db.get(Employee, emp_id)
    if emp is None:
        raise ValueError("員工不存在")
    if emp.role != "night":
        raise ValueError("該員工非大夜專職人員")

    existing = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.employee_id == emp_id,
            ScheduleEntry.year == year,
            ScheduleEntry.month == month,
            ScheduleEntry.day == day,
        )
    ).first()
    if existing is not None:
        existing.shift = shift
        existing.source = "night_input"
    else:
        db.add(
            ScheduleEntry(
                employee_id=emp_id,
                year=year,
                month=month,
                day=day,
                shift=shift,
                source="night_input",
            )
        )
    db.commit()


def delete_night_entry(
    db: Session, emp_id: int, year: int, month: int, day: int
) -> None:
    rec = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.employee_id == emp_id,
            ScheduleEntry.year == year,
            ScheduleEntry.month == month,
            ScheduleEntry.day == day,
            ScheduleEntry.source == "night_input",
        )
    ).first()
    if rec is None:
        raise ValueError("該日無大夜班紀錄")
    db.delete(rec)
    db.commit()


def add_backup_request(db: Session, year: int, month: int, day: int) -> DBackupRequest:
    rec = DBackupRequest(year=year, month=month, day=day, status="pending")
    db.add(rec)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ValueError("該日已有 D 班備援指示")
    db.refresh(rec)
    return rec


def remove_backup_request(db: Session, req_id: int) -> None:
    rec = db.get(DBackupRequest, req_id)
    if rec is None:
        raise ValueError("備援指示不存在")
    db.delete(rec)
    db.commit()


def get_backup_requests(db: Session, year: int, month: int) -> list[DBackupRequest]:
    return list(
        db.scalars(
            select(DBackupRequest).where(
                DBackupRequest.year == year, DBackupRequest.month == month
            ).order_by(DBackupRequest.day)
        )
    )


def validate_night_schedule(db: Session, year: int, month: int) -> dict:
    data = data_loader.load(db, year, month)
    night_emps = [e for e in data.employees if e.role == "night"]
    if not night_emps:
        return {"violations": []}

    night_data = dataclasses.replace(data, employees=night_emps)
    night_partial: dict[int, list[str]] = {}
    for emp in night_emps:
        nights = data.night_schedule.get(emp.id, {})
        night_partial[emp.id] = [
            nights.get(d + 1, "OFF") for d in range(data.num_days)
        ]

    viols = validator.validate(night_data, night_partial)
    return {
        "violations": [
            {"rule": v["rule"], "message": v["message"]}
            for v in viols
            if v["rule"] in ("H2", "H3", "H4", "H12")
        ]
    }
