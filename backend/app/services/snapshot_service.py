import json

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database.models import (
    DesignatedOffDay,
    Employee,
    ScheduleEntry,
    ScheduleSnapshot,
    SpecialLeave,
)


def _next_version(db: Session, year: int, month: int) -> str:
    count = len(
        list(
            db.scalars(
                select(ScheduleSnapshot).where(
                    ScheduleSnapshot.year == year, ScheduleSnapshot.month == month
                )
            )
        )
    )
    return f"v{count + 1}"


def _capture(db: Session, year: int, month: int) -> dict:
    entries = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.year == year, ScheduleEntry.month == month
        )
    )
    leaves = db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.year == year, SpecialLeave.month == month
        )
    )
    designated = db.scalars(
        select(DesignatedOffDay).where(
            DesignatedOffDay.year == year, DesignatedOffDay.month == month
        )
    )
    return {
        "schedule": [
            {"employee_id": e.employee_id, "day": e.day, "shift": e.shift, "source": e.source}
            for e in entries
        ],
        "leaves": [
            {"employee_id": lv.employee_id, "day": lv.day, "leave_type": lv.leave_type}
            for lv in leaves
        ],
        "designated": [
            {"employee_id": d.employee_id, "day": d.day} for d in designated
        ],
    }


def create_snapshot(
    db: Session, year: int, month: int, name: str | None = None, version_number: str | None = None
) -> ScheduleSnapshot:
    version = version_number or _next_version(db, year, month)
    data = _capture(db, year, month)
    snap = ScheduleSnapshot(
        year=year,
        month=month,
        version_number=version,
        name=name or version,
        schedule_data=json.dumps(data, ensure_ascii=False),
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


def list_snapshots(db: Session, year: int, month: int) -> list[ScheduleSnapshot]:
    return list(
        db.scalars(
            select(ScheduleSnapshot)
            .where(ScheduleSnapshot.year == year, ScheduleSnapshot.month == month)
            .order_by(ScheduleSnapshot.id)
        )
    )


def get_snapshot(db: Session, snapshot_id: int) -> ScheduleSnapshot | None:
    return db.get(ScheduleSnapshot, snapshot_id)


def restore_snapshot(db: Session, snapshot_id: int) -> ScheduleSnapshot:
    snap = db.get(ScheduleSnapshot, snapshot_id)
    if snap is None:
        raise ValueError("快照不存在")
    data = json.loads(snap.schedule_data)

    db.execute(
        delete(ScheduleEntry).where(
            ScheduleEntry.year == snap.year, ScheduleEntry.month == snap.month
        )
    )
    for e in data.get("schedule", []):
        db.add(
            ScheduleEntry(
                employee_id=e["employee_id"],
                year=snap.year,
                month=snap.month,
                day=e["day"],
                shift=e["shift"],
                source=e.get("source", "manual"),
            )
        )

    db.execute(
        delete(SpecialLeave).where(
            SpecialLeave.year == snap.year, SpecialLeave.month == snap.month
        )
    )
    for lv in data.get("leaves", []):
        db.add(
            SpecialLeave(
                employee_id=lv["employee_id"],
                year=snap.year,
                month=snap.month,
                day=lv["day"],
                leave_type=lv["leave_type"],
            )
        )

    db.execute(
        delete(DesignatedOffDay).where(
            DesignatedOffDay.year == snap.year, DesignatedOffDay.month == snap.month
        )
    )
    for d in data.get("designated", []):
        db.add(
            DesignatedOffDay(
                employee_id=d["employee_id"],
                year=snap.year,
                month=snap.month,
                day=d["day"],
            )
        )

    db.commit()
    return snap


def diff_snapshots(db: Session, snapshot_id_a: int, snapshot_id_b: int) -> dict:
    a = db.get(ScheduleSnapshot, snapshot_id_a)
    b = db.get(ScheduleSnapshot, snapshot_id_b)
    if a is None or b is None:
        raise ValueError("快照不存在")
    da = json.loads(a.schedule_data)
    db_ = json.loads(b.schedule_data)

    map_a = {(e["employee_id"], e["day"]): e["shift"] for e in da.get("schedule", [])}
    map_b = {(e["employee_id"], e["day"]): e["shift"] for e in db_.get("schedule", [])}

    emp_names = {
        emp.id: emp.name for emp in db.scalars(select(Employee))
    }

    changes = []
    for key in sorted(set(map_a) | set(map_b)):
        old = map_a.get(key)
        new = map_b.get(key)
        if old != new:
            emp_id, day = key
            changes.append(
                {
                    "employee_id": emp_id,
                    "employee_name": emp_names.get(emp_id),
                    "day": day,
                    "old_shift": old,
                    "new_shift": new,
                }
            )
    return {"changes": changes}
