import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp
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
from app.scheduler import data_loader, engine, validator

init_db()
db = SessionLocal()

NIGHT = {1:"D",2:"OFF",3:"D",4:"OFF",5:"D",6:"D",7:"OFF",8:"D",9:"D",10:"D",
         11:"OFF",12:"D",13:"D",14:"OFF",15:"D",16:"D",17:"D",18:"OFF",19:"D",
         20:"D",21:"OFF",22:"D",23:"D",24:"D",25:"OFF",26:"D",27:"D",28:"OFF",
         29:"D",30:"D",31:"D"}


def make_employee(name, role, shifts, pref=None, mode=None):
    import json
    return Employee(name=name, role=role, available_shifts=json.dumps(shifts),
                    preferred_shift=pref, scheduling_mode=mode or ("manual" if role == "night" else "auto"))


def add_prev(db, eid, shifts):
    db.add(PreviousMonthLink(employee_id=eid, year=2026, month=8,
        day_5_shift=shifts[0], day_4_shift=shifts[1], day_3_shift=shifts[2],
        day_2_shift=shifts[3], day_1_shift=shifts[4], source="manual"))


def add_night(db, eid):
    for day, sh in NIGHT.items():
        db.add(ScheduleEntry(employee_id=eid, year=2026, month=8, day=day, shift=sh, source="night_input"))


fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


print("=" * 70)
print("TEST A: 5 員工（軟性約束驗證）")
print("=" * 70)
wang = make_employee("王先生", "general", ["A","B","C"])
lee = make_employee("李小姐", "general", ["A","B","C"], pref="A")
chang = make_employee("張先生", "general", ["A","B","C"], pref="C")
lin = make_employee("林備援", "cd_backup", ["C","D"], pref="C")
chen = make_employee("陳大夜", "night", ["D"], pref="D")
db.add_all([wang, lee, chang, lin, chen])
db.commit()
db.add(DesignatedOffDay(employee_id=wang.id, year=2026, month=8, day=5))
db.add(DesignatedOffDay(employee_id=wang.id, year=2026, month=8, day=12))
db.add(SpecialLeave(employee_id=lee.id, year=2026, month=8, day=20))
for eid, sh in {wang.id:["A","B","OFF","A","B"], lee.id:["B","C","A","OFF","A"],
                chang.id:["C","OFF","A","B","C"], lin.id:["C","D","OFF","C","OFF"],
                chen.id:["D","D","D","D","OFF"]}.items():
    add_prev(db, eid, sh)
add_night(db, chen.id)
db.add(DBackupRequest(year=2026, month=8, day=14, assigned_employee_id=lin.id, status="assigned"))
db.commit()

data = data_loader.load(db, 2026, 8)
result = engine.solve(data, max_time=30)
name_to_id = {e.name: e.id for e in data.employees}
sched_by_id = {name_to_id[nm]: row for nm, row in result.schedule.items()}

print("success:", result.success, "| objective:", result.objective_value, "| time:", round(result.solve_time,3))
print("stats:", result.soft_constraint_stats)
if not result.success:
    print("ERROR:", result.error)
    sys.exit(1)

check(result.objective_value is not None, "1. objective_value 不為 None")
stats = result.soft_constraint_stats
check(stats is not None and len(stats) == 8, "2. 軟性約束統計全部回傳 (8 項)")
check(stats["s1_5consecutive_count"] <= 1, f"3. S1 連續5天次數最少化 (={stats['s1_5consecutive_count']})")
check(stats["s2_b_to_a_count"] == 0, f"4. S2 B→A = 0 (={stats['s2_b_to_a_count']})")
check(stats["s3_c_to_b_count"] == 0, f"5. S3 C→B = 0 (={stats['s3_c_to_b_count']})")
check(stats["s4_c_to_d_count"] <= 1, f"6. S4 C→D 最少 (={stats['s4_c_to_d_count']})")
check(stats["s5_preferred_satisfied"] > 0, f"7. S5 偏好滿足 >0 (={stats['s5_preferred_satisfied']})")
check(stats["s6_work_days_spread"] <= 2, f"8. S6 上班天數差 <=2 (={stats['s6_work_days_spread']})")
check(stats["s7_non_backup_d_count"] == 0, f"9. S7 非備援日 D = 0 (={stats['s7_non_backup_d_count']})")
violations = validator.validate(data, sched_by_id)
check(len(violations) == 0, f"10. 硬性約束 0 violations (={len(violations)})")

work_counts = {nm: sum(1 for s in row if s in ("A","B","C","D")) for nm, row in result.schedule.items()}
print("  上班天數:", work_counts)
print("  林備援 row:", result.schedule["林備援"])

print()
print("=" * 70)
print("TEST B: 8 員工（效能驗證）— H1 每日上限 7 人，最多約 9 員工可行")
print("=" * 70)
for Model in [ScheduleEntry, DesignatedOffDay, SpecialLeave, PreviousMonthLink, DBackupRequest, Employee]:
    db.query(Model).delete()
db.commit()
db2 = db
emps = []
for i in range(5):
    pref = ["A","B","C",None,"A"][i]
    emps.append(make_employee(f"一般{i+1}", "general", ["A","B","C"], pref=pref))
cb1 = make_employee("備援甲", "cd_backup", ["C","D"], pref="C")
cb2 = make_employee("備援乙", "cd_backup", ["C","D"], pref="C")
ni = make_employee("大夜專", "night", ["D"], pref="D")
db2.add_all(emps + [cb1, cb2, ni])
db2.commit()
db2.add(DesignatedOffDay(employee_id=emps[0].id, year=2026, month=8, day=5))
db2.add(DesignatedOffDay(employee_id=emps[1].id, year=2026, month=8, day=12))
db2.add(SpecialLeave(employee_id=emps[2].id, year=2026, month=8, day=20))
for e in emps:
    add_prev(db2, e.id, ["A","B","OFF","A","B"])
add_prev(db2, cb1.id, ["C","D","OFF","C","OFF"])
add_prev(db2, cb2.id, ["C","D","OFF","C","OFF"])
add_prev(db2, ni.id, ["D","D","D","D","OFF"])
add_night(db2, ni.id)
db2.add(DBackupRequest(year=2026, month=8, day=14, assigned_employee_id=cb1.id, status="assigned"))
db2.commit()

data2 = data_loader.load(db2, 2026, 8)
print("員工人數:", len(data2.employees))
result2 = engine.solve(data2, max_time=30)
print("success:", result2.success, "| objective:", result2.objective_value, "| time:", round(result2.solve_time,3))
print("stats:", result2.soft_constraint_stats)
if not result2.success:
    print("ERROR:", result2.error)
    sys.exit(1)
name_to_id2 = {e.name: e.id for e in data2.employees}
sched_by_id2 = {name_to_id2[nm]: row for nm, row in result2.schedule.items()}
v2 = validator.validate(data2, sched_by_id2)
check(result2.solve_time < 30, f"B1. 求解時間 < 30s ({round(result2.solve_time,3)}s)")
check(result2.objective_value is not None, "B2. objective_value 不為 None")
check(len(v2) == 0, f"B3. 硬性約束 0 violations (={len(v2)})")
wc2 = {nm: sum(1 for s in row if s in ("A","B","C","D")) for nm, row in result2.schedule.items()}
print("  上班天數:", wc2)

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
else:
    print("ALL CHECKS PASSED")
    sys.exit(0)
