"""Seed the dev DB with test data and generate the August 2026 schedule.

Run from the backend/ directory:
    .venv/bin/python tests/seed_dev.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import (
    DBackupRequest,
    DesignatedOffDay,
    Employee,
    PreviousMonthLink,
    ScheduleEntry,
    SpecialLeave,
)
from app.scheduler import data_loader, engine
from app.services import schedule_service

NIGHT = {1:"D",2:"OFF",3:"D",4:"OFF",5:"D",6:"D",7:"OFF",8:"D",9:"D",10:"D",
         11:"OFF",12:"D",13:"D",14:"OFF",15:"D",16:"D",17:"D",18:"OFF",19:"D",
         20:"D",21:"OFF",22:"D",23:"D",24:"D",25:"OFF",26:"D",27:"D",28:"OFF",
         29:"D",30:"D",31:"D"}


def _emp(name, role, shifts, pref=None):
    return Employee(
        name=name,
        role=role,
        available_shifts=json.dumps(shifts),
        preferred_shift=pref,
        scheduling_mode="manual" if role == "night" else "auto",
    )


def main():
    init_db()
    db = SessionLocal()
    for M in [ScheduleEntry, DesignatedOffDay, SpecialLeave, PreviousMonthLink, DBackupRequest, Employee]:
        db.query(M).delete()
    db.commit()

    wang = _emp("王先生", "general", ["A", "B", "C"])
    lee = _emp("李小姐", "general", ["A", "B", "C"], pref="A")
    chang = _emp("張先生", "general", ["A", "B", "C"], pref="C")
    lin = _emp("林備援", "cd_backup", ["C", "D"], pref="C")
    chen = _emp("陳大夜", "night", ["D"], pref="D")
    db.add_all([wang, lee, chang, lin, chen])
    db.commit()

    db.add(DesignatedOffDay(employee_id=wang.id, year=2026, month=8, day=5))
    db.add(DesignatedOffDay(employee_id=wang.id, year=2026, month=8, day=12))
    db.add(SpecialLeave(employee_id=lee.id, year=2026, month=8, day=20))
    for eid, sh in {
        wang.id: ["A", "B", "OFF", "A", "B"],
        lee.id: ["B", "C", "A", "OFF", "A"],
        chang.id: ["C", "OFF", "A", "B", "C"],
        lin.id: ["C", "D", "OFF", "C", "OFF"],
        chen.id: ["D", "D", "D", "D", "OFF"],
    }.items():
        db.add(PreviousMonthLink(
            employee_id=eid, year=2026, month=8,
            day_5_shift=sh[0], day_4_shift=sh[1], day_3_shift=sh[2],
            day_2_shift=sh[3], day_1_shift=sh[4], source="manual",
        ))
    for day, sh in NIGHT.items():
        db.add(ScheduleEntry(employee_id=chen.id, year=2026, month=8, day=day, shift=sh, source="night_input"))
    db.add(DBackupRequest(year=2026, month=8, day=14, assigned_employee_id=lin.id, status="assigned"))
    db.commit()

    data = data_loader.load(db, 2026, 8)
    result = engine.solve(data, max_time=30)
    if not result.success:
        print("SOLVE FAILED:", result.error)
        sys.exit(1)

    entries = []
    for emp in data.employees:
        row = result.schedule.get(emp.name)
        if not row:
            continue
        for d_idx, shift in enumerate(row):
            day = d_idx + 1
            if emp.role == "night":
                source = "night_input"
            elif day in data.designated_off_days.get(emp.id, []):
                source = "designated"
            elif day in data.special_leaves.get(emp.id, []):
                source = "special"
            elif emp.role == "cd_backup" and data.d_backup_assignments.get(day) == emp.id:
                source = "backup"
            else:
                source = "auto"
            entries.append({"employee_id": emp.id, "day": day, "shift": shift, "source": source})
    schedule_service.replace_month_schedule(db, 2026, 8, entries)

    view = schedule_service.get_month_view(db, 2026, 8, data.num_days)
    sched = view["schedule"]
    print(f"Seeded {len(sched)} employees, August 2026 schedule saved.")
    print(f"objective={result.objective_value}, solve_time={result.solve_time:.3f}s")
    print("Sample (王先生):", sched.get("王先生"))
    db.close()


if __name__ == "__main__":
    main()
