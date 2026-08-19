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
from app.services import leave_type_service, off_day_service

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


# 1. 內建假別
builtin = {lt.code: lt for lt in leave_type_service.list_leave_types(db)}
check({"SPECIAL", "PERSONAL", "SICK"} <= set(builtin), "內建假別存在 (SPECIAL/PERSONAL/SICK)")
check(builtin["PERSONAL"].name == "事假", "事假名稱正確")

# 2. 自訂假別 CRUD
custom = leave_type_service.create_leave_type(db, "喪假", "#ffcdd2", "#b71c1c")
check(leave_type_service.get_leave_type(db, custom.code) is not None, "自訂假別建立")
updated = leave_type_service.update_leave_type(db, custom.code, name="公假")
check(updated.name == "公假", "自訂假別改名")

# 員工
wang = Employee(name="王先生", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
lee = Employee(name="李小姐", role="general", available_shifts='["A","B","C"]', preferred_shift="A", scheduling_mode="auto")
chang = Employee(name="張先生", role="general", available_shifts='["A","B","C"]', preferred_shift="C", scheduling_mode="auto")
lin = Employee(name="林備援", role="cd_backup", available_shifts='["C","D"]', preferred_shift="C", scheduling_mode="auto")
chen = Employee(name="陳大夜", role="night", available_shifts='["D"]', preferred_shift="D", scheduling_mode="manual")
db.add_all([wang, lee, chang, lin, chen])
db.commit()

db.add(DesignatedOffDay(employee_id=wang.id, year=2026, month=8, day=5))
db.add(DesignatedOffDay(employee_id=wang.id, year=2026, month=8, day=12))

# 不同假別（事假/病假/自訂）
db.add(SpecialLeave(employee_id=lee.id, year=2026, month=8, day=20, leave_type="PERSONAL"))
db.add(SpecialLeave(employee_id=lee.id, year=2026, month=8, day=21, leave_type="SICK"))
db.add(SpecialLeave(employee_id=chang.id, year=2026, month=8, day=22, leave_type=custom.code))

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

night = {1: "D", 2: "OFF", 3: "OFF", 4: "OFF", 5: "D", 6: "D", 7: "D", 8: "D", 9: "D", 10: "OFF",
         11: "D", 12: "D", 13: "D", 14: "OFF", 15: "D", 16: "D", 17: "OFF", 18: "OFF", 19: "D",
         20: "D", 21: "D", 22: "D", 23: "D", 24: "OFF", 25: "D", 26: "D", 27: "D", 28: "OFF",
         29: "D", 30: "D", 31: "D"}
for day, sh in night.items():
    db.add(ScheduleEntry(employee_id=chen.id, year=2026, month=8, day=day, shift=sh, source="night_input"))
db.commit()

data = data_loader.load(db, 2026, 8)
result = engine.solve(data, max_time=30)
check(result.success, "求解成功")

if result.success:
    name_to_id = {e.name: e.id for e in data.employees}
    sched_by_id = {name_to_id[nm]: row for nm, row in result.schedule.items()}
    check(result.schedule["李小姐"][19] == "SPECIAL", "事假(20) 固定為 SPECIAL")
    check(result.schedule["李小姐"][20] == "SPECIAL", "病假(21) 固定為 SPECIAL")
    check(result.schedule["張先生"][21] == "SPECIAL", "自訂假(22) 固定為 SPECIAL")
    violations = validator.validate(data, sched_by_id)
    check(len(violations) == 0, f"validator 零違規 (實際 {len(violations)} 條)")

# 3. 假別會「連成一段」：5休 + 6事假 + 7休 = 1 次連休
tester = Employee(name="測試員", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
db.add(tester)
db.commit()
db.add(DesignatedOffDay(employee_id=tester.id, year=2026, month=8, day=5))
db.add(SpecialLeave(employee_id=tester.id, year=2026, month=8, day=6, leave_type="PERSONAL"))
db.add(DesignatedOffDay(employee_id=tester.id, year=2026, month=8, day=7))
db.commit()
cnt, _ = off_day_service.count_consecutive_off(db, tester.id, 2026, 8)
check(cnt == 1, f"假別連成一段 (5休+6事假+7休 → 1 次，實際 {cnt})")

# 4. 再加一段連休 (11,12) → 共 2 次
db.add(DesignatedOffDay(employee_id=tester.id, year=2026, month=8, day=11))
db.add(DesignatedOffDay(employee_id=tester.id, year=2026, month=8, day=12))
db.commit()
cnt, _ = off_day_service.count_consecutive_off(db, tester.id, 2026, 8)
check(cnt == 2, f"共 2 次連休 (實際 {cnt})")

# 5. 摘要分項統計
summary = off_day_service.get_off_day_summary(db, 2026, 8)
lee_sum = summary[str(lee.id)]
check(lee_sum["leave_type_counts"].get("PERSONAL") == 1, "李 事假 1 天")
check(lee_sum["leave_type_counts"].get("SICK") == 1, "李 病假 1 天")
check(lee_sum["total_leave_days"] == 2, f"李 請假總天數 2 (實際 {lee_sum['total_leave_days']})")

# 6. 刪除防呆
try:
    leave_type_service.delete_leave_type(db, custom.code)
    check(False, "已使用假別應拒刪")
except ValueError:
    check(True, "已使用假別拒絕刪除")

unused = leave_type_service.create_leave_type(db, "補休", "#c8e6c9", "#1b5e20")
leave_type_service.delete_leave_type(db, unused.code)
check(leave_type_service.get_leave_type(db, unused.code) is None, "未使用假別可刪除")

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("MODULE 1 ALL CHECKS PASSED")
sys.exit(0)
