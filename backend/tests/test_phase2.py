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
from app.scheduler.off_count import count_off_blocks

init_db()
db = SessionLocal()

wang = Employee(name="王先生", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
lee = Employee(name="李小姐", role="general", available_shifts='["A","B","C"]', preferred_shift="A", scheduling_mode="auto")
chang = Employee(name="張先生", role="general", available_shifts='["A","B","C"]', preferred_shift="C", scheduling_mode="auto")
lin = Employee(name="林備援", role="cd_backup", available_shifts='["C","D"]', preferred_shift="C", scheduling_mode="auto")
chen = Employee(name="陳大夜", role="night", available_shifts='["D"]', preferred_shift="D", scheduling_mode="manual")
db.add_all([wang, lee, chang, lin, chen])
db.commit()

db.add(DesignatedOffDay(employee_id=wang.id, year=2026, month=8, day=5))
db.add(DesignatedOffDay(employee_id=wang.id, year=2026, month=8, day=12))
db.add(SpecialLeave(employee_id=lee.id, year=2026, month=8, day=20))

prev = {
    wang.id: ["A", "B", "OFF", "A", "B"],
    lee.id: ["B", "C", "A", "OFF", "A"],
    chang.id: ["C", "OFF", "A", "B", "C"],
    lin.id: ["C", "D", "OFF", "C", "OFF"],
    chen.id: ["D", "D", "D", "D", "OFF"],
}
for eid, shifts in prev.items():
    db.add(PreviousMonthLink(
        employee_id=eid, year=2026, month=8,
        day_5_shift=shifts[0], day_4_shift=shifts[1], day_3_shift=shifts[2],
        day_2_shift=shifts[3], day_1_shift=shifts[4], source="manual",
    ))

night = {1:"D",2:"OFF",3:"OFF",4:"OFF",5:"D",6:"D",7:"D",8:"D",9:"D",10:"OFF",
         11:"D",12:"D",13:"D",14:"OFF",15:"D",16:"D",17:"OFF",18:"OFF",19:"D",
         20:"D",21:"D",22:"D",23:"D",24:"OFF",25:"D",26:"D",27:"D",28:"OFF",
         29:"D",30:"D",31:"D"}
for day, sh in night.items():
    db.add(ScheduleEntry(employee_id=chen.id, year=2026, month=8, day=day, shift=sh, source="night_input"))

db.add(DBackupRequest(year=2026, month=8, day=14, assigned_employee_id=lin.id, status="assigned", note="缺D"))
db.commit()

data = data_loader.load(db, 2026, 8)
result = engine.solve(data, max_time=30)

print("=" * 70)
print("SOLVE success:", result.success)
print("solve_time:", round(result.solve_time, 3))
if result.error:
    print("error:", result.error)
print("=" * 70)

if not result.success:
    sys.exit(1)

name_to_id = {e.name: e.id for e in data.employees}
sched_by_id = {name_to_id[nm]: row for nm, row in result.schedule.items()}

weekdays = ["一", "二", "三", "四", "五", "六", "日"]
hdr = "員工".ljust(8) + "".join(f"{d:>4}" for d in range(1, 32))
print(hdr)
for nm, row in result.schedule.items():
    print(nm.ljust(8) + "".join(f"{r:>4}" for r in row))
print("星期    " + "".join(f"{weekdays[data.dates[d].weekday()]:>4}" for d in range(31)))
cov_a = [sum(1 for r in result.schedule.values() if r[d] == "A") for d in range(31)]
cov_c = [sum(1 for r in result.schedule.values() if r[d] == "C") for d in range(31)]
cov_d = [sum(1 for r in result.schedule.values() if r[d] == "D") for d in range(31)]
print("A 覆蓋  " + "".join(f"{c:>4}" for c in cov_a))
print("C 覆蓋  " + "".join(f"{c:>4}" for c in cov_c))
print("D 覆蓋  " + "".join(f"{c:>4}" for c in cov_d))

violations = validator.validate(data, sched_by_id)
print("=" * 70)
print("VALIDATOR violations:", len(violations))
for code, msg in violations:
    print(f"  [{code}] {msg}")

print("=" * 70)
print("8 項條件驗證:")
fails = []

def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)

check(all(a >= 1 and c >= 1 for a, c in zip(cov_a, cov_c)), "1. 每天有 A+C 班")
ca_transitions = []
for nm, row in result.schedule.items():
    for d in range(30):
        if row[d] == "C" and row[d + 1] == "A":
            ca_transitions.append((nm, d + 1))
check(len(ca_transitions) == 0, f"2. 無 C→A 銜接 (找到 {len(ca_transitions)})")

max_consec = 0
for nm, row in result.schedule.items():
    run = 0
    for s in row:
        if s in ("A", "B", "C", "D"):
            run += 1
            max_consec = max(max_consec, run)
        else:
            run = 0
check(max_consec <= 5, f"3. 連續上班 <=5 (max={max_consec})")

week_ok = True
for nm, row in result.schedule.items():
    for w_i, w in enumerate(data.weeks):
        off = sum(1 for d in w if row[d] == "OFF")
        if w_i == 0:
            weekday_day1 = data.dates[0].weekday()
            prev = data.previous_month.get(name_to_id[nm])
            if prev and weekday_day1 > 0:
                prev_off = sum(1 for j in range(1, min(weekday_day1, 5) + 1) if prev[-j] == "OFF")
                if off + prev_off != 2:
                    week_ok = False
            else:
                if len(w) >= 5 and off != 2:
                    week_ok = False
        else:
            if len(w) >= 5 and off != 2:
                week_ok = False
            if len(w) < 5 and off > 2:
                week_ok = False
check(week_ok, "4. 每週休 2 天")

consec_ok = True
for nm, row in result.schedule.items():
    cnt, _ = count_off_blocks(row)
    if cnt != 2:
        consec_ok = False
check(consec_ok, "5. 連休剛好 2 次")

backup_ok = result.schedule["林備援"][13] == "D"
c_on_backup = sum(1 for nm, row in result.schedule.items() if nm != "林備援" and row[13] == "C")
backup_ok = backup_ok and c_on_backup >= 1
check(backup_ok, f"6. D 備援日(14) 林備援=D 且 C 班有人 (林={result.schedule['林備援'][13]}, C人數={c_on_backup})")

night_match = all(result.schedule["陳大夜"][d] == night[d + 1] for d in range(31))
check(night_match, "7. 大夜專職班次與手動輸入一致")

desig_ok = result.schedule["王先生"][4] == "OFF" and result.schedule["王先生"][11] == "OFF"
spec_ok = result.schedule["李小姐"][19] == "SPECIAL"
check(desig_ok, "8a. 指定休假正確套用 (王 5,12)")
check(spec_ok, "8b. 特休正確套用 (李 20)")

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
else:
    print("ALL CHECKS PASSED")
    sys.exit(0)
