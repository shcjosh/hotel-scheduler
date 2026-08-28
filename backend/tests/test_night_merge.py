"""大夜班表整併測試（v1.1.4-beta Commit 1）：
排班表畫筆直接排大夜格位 — source 一致性與保護機制。
"""
import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select

from app.database.connection import SessionLocal, init_db
from app.database.models import (
    Employee,
    NightRuleOverride,
    PreviousMonthLink,
    ScheduleEntry,
)
from app.scheduler import data_loader, engine
from app.services import schedule_service

init_db()
db = SessionLocal()

wang = Employee(name="王先生", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
lee = Employee(name="李小姐", role="general", available_shifts='["A","B","C"]', preferred_shift="A", scheduling_mode="auto")
chang = Employee(name="張先生", role="general", available_shifts='["A","B","C"]', preferred_shift="C", scheduling_mode="auto")
lin = Employee(name="林備援", role="cd_backup", available_shifts='["C","D"]', preferred_shift="C", scheduling_mode="auto")
chen = Employee(name="陳大夜", role="night", available_shifts='["D"]', preferred_shift="D", scheduling_mode="manual")
db.add_all([wang, lee, chang, lin, chen])
db.commit()

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
db.commit()

NIGHT_PATTERN = {
    1: "D", 2: "OFF", 3: "OFF", 4: "OFF", 5: "D", 6: "D", 7: "D", 8: "D",
    9: "D", 10: "OFF", 11: "D", 12: "D", 13: "D", 14: "OFF", 15: "D",
    16: "D", 17: "OFF", 18: "OFF", 19: "D", 20: "D", 21: "D", 22: "D",
    23: "D", 24: "OFF", 25: "D", 26: "D", 27: "D", 28: "OFF", 29: "D",
    30: "D", 31: "D",
}

passed = []

def check(name, cond):
    passed.append((name, cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}")

def entry(emp_id, day):
    return db.scalars(select(ScheduleEntry).where(
        ScheduleEntry.employee_id == emp_id, ScheduleEntry.day == day
    )).first()

print("=" * 70)
print("A. upsert_cell 大夜格位（source 一致性）")
print("=" * 70)

# 1. 大夜排 D → source=night_input
schedule_service.upsert_cell(db, chen.id, 2026, 8, 1, "D")
e = entry(chen.id, 1)
check("1. 大夜排 D 成功且 source=night_input", e is not None and e.shift == "D" and e.source == "night_input")

# 2. 大夜改 OFF → 仍 night_input（更新同一筆）
schedule_service.upsert_cell(db, chen.id, 2026, 8, 1, "OFF")
db.refresh(e)
check("2. 大夜改 OFF，source 仍為 night_input", e.shift == "OFF" and e.source == "night_input")

# 3. 大夜排特休 → 擋
try:
    schedule_service.upsert_cell(db, chen.id, 2026, 8, 2, "SPECIAL")
    check("3. 大夜排 SPECIAL 被擋", False)
except ValueError:
    check("3. 大夜排 SPECIAL 被擋", True)

# 4. 大夜排 A → 擋
try:
    schedule_service.upsert_cell(db, chen.id, 2026, 8, 2, "A")
    check("4. 大夜排 A 被擋", False)
except ValueError:
    check("4. 大夜排 A 被擋", True)

# 5. 大夜排 EMPTY → 刪除紀錄（engine 預設 OFF）
schedule_service.upsert_cell(db, chen.id, 2026, 8, 1, "EMPTY")
check("5. 大夜 EMPTY 刪除紀錄", entry(chen.id, 1) is None)

# 6. 非大夜排 D → 擋（general / cd_backup 都不行）
for emp in (wang, lin):
    try:
        schedule_service.upsert_cell(db, emp.id, 2026, 8, 3, "D")
        check(f"6. {emp.name}（{emp.role}）排 D 被擋", False)
    except ValueError:
        check(f"6. {emp.name}（{emp.role}）排 D 被擋", True)

# 7. 回歸：一般員工排 A → source=manual
schedule_service.upsert_cell(db, wang.id, 2026, 8, 3, "A")
e = entry(wang.id, 3)
check("7. 一般員工排 A，source=manual（回歸）", e is not None and e.source == "manual")

print("=" * 70)
print("B. data_loader 只認 night_input（畫筆來源可被引擎讀到）")
print("=" * 70)

for day in range(1, 32):
    schedule_service.upsert_cell(db, chen.id, 2026, 8, day, NIGHT_PATTERN[day])
data = data_loader.load(db, 2026, 8)
night_days = data.night_schedule.get(chen.id, {})
check("8. data_loader 讀到畫筆排的完整大夜班表",
      night_days.get(1) == "D" and night_days.get(2) == "OFF" and night_days.get(31) == "D")

print("=" * 70)
print("C. 自動排班不破壞大夜手動班次")
print("=" * 70)

result = engine.solve(data, max_time=30)
check("9. 求解成功", result.success)
if result.success:
    row = result.schedule["陳大夜"]
    ok10 = all(row[d - 1] == NIGHT_PATTERN[d] for d in NIGHT_PATTERN)
    check("10. 排班後大夜手動班次逐日保留", ok10)

    # 情境 2：畫筆對調（5: D→OFF、4: OFF→D）→ 再排 → 修改保留
    schedule_service.upsert_cell(db, chen.id, 2026, 8, 5, "OFF")
    schedule_service.upsert_cell(db, chen.id, 2026, 8, 4, "D")
    data2 = data_loader.load(db, 2026, 8)
    result2 = engine.solve(data2, max_time=30)
    check("11. 二次求解成功", result2.success)
    if result2.success:
        row2 = result2.schedule["陳大夜"]
        check("12. 對調後（4=D, 5=OFF）再排班仍保留", row2[3] == "D" and row2[4] == "OFF")

print("=" * 70)
print("D. 清空班表保留大夜")
print("=" * 70)

cleared = schedule_service.clear_month_schedule(db, 2026, 8)
remaining = list(db.scalars(select(ScheduleEntry).where(
    ScheduleEntry.employee_id == chen.id, ScheduleEntry.source == "night_input"
)))
check("13. 清空班表後大夜 night_input 紀錄保留（31 筆）", len(remaining) == 31)

print("=" * 70)
print("E. validate_cell 尊重大夜規則開關")
print("=" * 70)

# 全月 D → 無開關時 H12 應違規；ignore_all 時應回傳空
for day in range(1, 32):
    schedule_service.upsert_cell(db, chen.id, 2026, 8, day, "D")
r = schedule_service.validate_cell(db, chen.id, 2026, 8, 9, "D")
check("14. 無開關：全 D 月份觸發 H12", any(v["rule"] == "H12" for v in r["violations"]))

db.add(NightRuleOverride(employee_id=chen.id, rule_name="ALL", enabled=1))
db.commit()
r = schedule_service.validate_cell(db, chen.id, 2026, 8, 9, "D")
check("15. ignore_all：validate_cell 回傳無違規", r["violations"] == [] and r["warnings"] == [])

db.delete(db.scalars(select(NightRuleOverride).where(
    NightRuleOverride.employee_id == chen.id, NightRuleOverride.rule_name == "ALL"
)).first())
db.add(NightRuleOverride(employee_id=chen.id, rule_name="H12", enabled=0))
db.commit()
r = schedule_service.validate_cell(db, chen.id, 2026, 8, 9, "D")
check("16. 關閉 H12：H12 不檢查", not any(v["rule"] == "H12" for v in r["violations"]))

print("=" * 70)
print("F. H8 跨月視窗不擋大夜手動班表（v1.1.4 修復：上月末連續上班）")
print("=" * 70)

# chen 全月 D（E 段遺留）+ 上月末 5 天全 D 連續上班
# → H8 spanning 視窗要求 8/1~8/4 須有休 → 修復前 INFEASIBLE
link = db.scalars(select(PreviousMonthLink).where(
    PreviousMonthLink.employee_id == chen.id
)).first()
link.day_5_shift = "D"
link.day_4_shift = "D"
link.day_3_shift = "D"
link.day_2_shift = "D"
link.day_1_shift = "D"
db.commit()
data3 = data_loader.load(db, 2026, 8)
result3 = engine.solve(data3, max_time=30)
check("17. 上月末連續上班 + 本月開頭全 D，大夜仍可求解（H8 豁免 night）", result3.success)

print("=" * 70)
print("G. 二館支援的大夜專職可排 D1（tag 優先於角色）")
print("=" * 70)

brian = Employee(name="劉亮增", role="night", tag="二館",
                 available_shifts='["D"]', preferred_shift="D", scheduling_mode="manual")
db.add(brian)
db.commit()

schedule_service.upsert_cell(db, brian.id, 2026, 8, 1, "D1")
e = entry(brian.id, 1)
check("18. tag+大夜 排 D1 成功且 source=night_input",
      e is not None and e.shift == "D1" and e.source == "night_input")

for bad in ("D", "OFF", "SPECIAL"):
    try:
        schedule_service.upsert_cell(db, brian.id, 2026, 8, 2, bad)
        check(f"19. tag+大夜 排 {bad} 被擋", False)
    except ValueError:
        check(f"19. tag+大夜 排 {bad} 被擋", True)

data4 = data_loader.load(db, 2026, 8)
check("20. tag 員工不在求解名單、其 D1 計入外部支援",
      all(emp.id != brian.id for emp in data4.employees)
      and "D" in data4.external_support.get(1, set()))

schedule_service.upsert_cell(db, brian.id, 2026, 8, 1, "EMPTY")
check("21. tag+大夜 EMPTY 刪除紀錄", entry(brian.id, 1) is None)

schedule_service.upsert_cell(db, brian.id, 2026, 8, 5, "D1")
schedule_service.clear_month_schedule(db, 2026, 8)
check("22. 清空班表保留二館支援 D1（source=night_input）", entry(brian.id, 5) is not None)

print("=" * 70)
failed = [name for name, ok in passed if not ok]
if failed:
    print(f"FAILED: {len(failed)} 項 -> {failed}")
    sys.exit(1)
print(f"ALL CHECKS PASSED ({len(passed)} 項)")
