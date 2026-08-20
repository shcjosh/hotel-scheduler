import dataclasses

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.models import DBackupRequest, Employee, NightRuleOverride, ScheduleEntry
from app.scheduler import data_loader, validator

NIGHT_RULES = ["H2", "H3", "H4", "H12"]
IGNORE_ALL_RULE = "ALL"


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
    data = data_loader.load(db, year, month)
    emp_by_id = {e.id: e for e in data.employees}

    def _req(b: DBackupRequest) -> dict:
        eid = data.d_backup_assignments.get(b.day)
        emp = emp_by_id.get(eid) if eid is not None else None
        return {
            "id": b.id,
            "year": b.year,
            "month": b.month,
            "day": b.day,
            "status": b.status,
            "assigned_employee_id": eid,
            "assignee_name": emp.name if emp else None,
            "assignee_role": emp.role if emp else None,
            "unfillable": b.day in data.d_backup_unfillable,
            "reason": data.d_backup_unfillable.get(b.day),
        }

    return {
        "night_schedule": schedule,
        "night_employees": [{"id": e.id, "name": e.name} for e in night_emps],
        "d_backup_requests": [_req(b) for b in backups],
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


def clear_night_schedule(db: Session, year: int, month: int) -> int:
    """Delete all night_input entries for the month (night staff D/OFF)."""
    result = db.execute(
        delete(ScheduleEntry).where(
            ScheduleEntry.year == year,
            ScheduleEntry.month == month,
            ScheduleEntry.source == "night_input",
        )
    )
    db.commit()
    return result.rowcount or 0


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


def remove_backup_request_by_day(db: Session, year: int, month: int, day: int) -> None:
    rec = db.scalars(
        select(DBackupRequest).where(
            DBackupRequest.year == year,
            DBackupRequest.month == month,
            DBackupRequest.day == day,
        )
    ).first()
    if rec is None:
        raise ValueError("該日無 D 班備援指示")
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
    out = []
    for v in viols:
        if v["rule"] not in ("H2", "H3", "H4", "H12"):
            continue
        eid = v["employee_id"]
        enabled = night_data.night_rule_overrides.get(eid)
        if enabled is not None and v["rule"] not in enabled:
            continue
        out.append({"rule": v["rule"], "message": v["message"], "employee_id": eid})
    return {"violations": out}


def get_rule_overrides(db: Session) -> dict:
    night_ids = [
        e.id for e in db.scalars(
            select(Employee).where(Employee.is_active == 1, Employee.role == "night")
        )
    ]
    rows = list(db.scalars(select(NightRuleOverride)))
    by_emp: dict[int, dict[str, bool]] = {}
    for r in rows:
        by_emp.setdefault(r.employee_id, {})[r.rule_name] = bool(r.enabled)
    result = {}
    for nid in night_ids:
        emp_rules = by_emp.get(nid, {})
        entry = {rule: emp_rules.get(rule, True) for rule in NIGHT_RULES}
        entry["ignore_all"] = emp_rules.get(IGNORE_ALL_RULE, False)
        result[str(nid)] = entry
    return result


def _set_ignore_all(db: Session, emp_id: int, enabled: bool) -> None:
    existing = db.scalars(
        select(NightRuleOverride).where(
            NightRuleOverride.employee_id == emp_id,
            NightRuleOverride.rule_name == IGNORE_ALL_RULE,
        )
    ).first()
    if enabled:
        if existing is None:
            db.add(NightRuleOverride(employee_id=emp_id, rule_name=IGNORE_ALL_RULE, enabled=1))
        else:
            existing.enabled = 1
    elif existing is not None:
        db.delete(existing)
    db.commit()


def update_rule_overrides(db: Session, emp_id: int, payload: dict) -> dict:
    if "ignore_all" in payload:
        _set_ignore_all(db, emp_id, bool(payload["ignore_all"]))
        return get_rule_overrides(db)
    if "all" in payload:
        val = bool(payload["all"])
        rules = {rule: val for rule in NIGHT_RULES}
    else:
        rules = payload.get("rules", payload)

    for rule in NIGHT_RULES:
        enabled = 1 if rules.get(rule, True) else 0
        existing = db.scalars(
            select(NightRuleOverride).where(
                NightRuleOverride.employee_id == emp_id,
                NightRuleOverride.rule_name == rule,
            )
        ).first()
        if existing is None:
            db.add(NightRuleOverride(employee_id=emp_id, rule_name=rule, enabled=enabled))
        else:
            existing.enabled = enabled
    db.commit()
    return get_rule_overrides(db)
