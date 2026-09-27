"""離職員工（resign_date = 最後上班日）行為測試。

- 離職月及之前可見；離職月之後不顯示、不納入求解。
- 月中離職：最後上班日後固定不排班，且不套用 H2/H3/H4/H12。
- 真刪僅限沒有任何歷史資料者。
"""

import calendar
import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import Employee, ScheduleEntry
from app.scheduler import data_loader, engine, validator
from app.services import employee_service, schedule_service, support_service

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


Y, M = 2026, 6
g1 = Employee(name="甲", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
g2 = Employee(name="乙", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto", resign_date="2026-06-15")
g3 = Employee(name="丙", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
db.add_all([g1, g2, g3])
db.commit()

# 1. 可見性
check(employee_service.is_visible_in_month(g2, 2026, 5), "離職月之前可見")
check(employee_service.is_visible_in_month(g2, 2026, 6), "離職月（最後上班月）仍可見")
check(not employee_service.is_visible_in_month(g2, 2026, 7), "離職月之後不可見")

# 2. data_loader 6 月：含 g2、resign_cutoff=15
data = data_loader.load(db, Y, M)
check("乙" in {e.name for e in data.employees}, "6 月求解名單含離職員工")
check(data.resign_cutoff.get(g2.id) == 15, "6 月 resign_cutoff = 15")

# 3. 6 月無支援 → 失敗（15 日後只剩 2 人無法覆蓋 A+C）
r = engine.solve(data, max_time=30)
check(not r.success, "6 月無支援求解失敗（月中離職造成缺口）")

# 4. 診斷找出缺口，且都在離職日之後
gaps = engine.diagnose_support_needs(data)
check(gaps is not None, "可診斷出支援需求（非結構性無解）")
day_a, day_c = gaps if gaps else (set(), set())
all_gaps = sorted(day_a | day_c)
check(len(all_gaps) > 0, f"有支援缺口（共 {len(day_a) + len(day_c)} 格）")

# 5. 補支援後求解成功；g2 在 15 日後皆 OFF；驗證器不報個人規則
for d in sorted(day_a):
    support_service.create_auto_support(db, Y, M, d, "A", reason="test")
for d in sorted(day_c):
    support_service.create_auto_support(db, Y, M, d, "C", reason="test")
data = data_loader.load(db, Y, M)
r2 = engine.solve(data, max_time=30)
check(r2.success, f"補支援後求解成功（{r2.error}）")
if r2.success:
    row = r2.schedule["乙"]
    check(all(s == "OFF" for s in row[15:]), "最後上班日之後固定 OFF")
    by_id = {e.id: r2.schedule[e.name] for e in data.employees}
    viols = validator.validate(data, by_id)
    g2_v = [
        v for v in viols
        if v["employee_id"] == g2.id and v["rule"] in ("H2", "H3", "H4", "H12")
    ]
    check(len(g2_v) == 0, f"驗證器不對月中離職員工報個人規則（實際 {len(g2_v)}）")

# 6. 班表檢視：6 月顯示乙、7 月不顯示
view6 = schedule_service.get_month_view(db, Y, M, calendar.monthrange(Y, M)[1])
check("乙" in view6["schedule"], "6 月班表顯示離職員工")
view7 = schedule_service.get_month_view(db, 2026, 7, calendar.monthrange(2026, 7)[1])
check("乙" not in view7["schedule"], "7 月班表不顯示離職員工")

# 7. 7 月求解名單不含乙
data7 = data_loader.load(db, 2026, 7)
check("乙" not in {e.name for e in data7.employees}, "7 月求解不納入離職員工")

# 8. 真刪守衛
db.add(ScheduleEntry(employee_id=g2.id, year=Y, month=M, day=1, shift="A", source="auto"))
db.commit()
try:
    employee_service.hard_delete_employee(db, g2)
    check(False, "有歷史資料者不可硬刪")
except ValueError:
    check(True, "有歷史資料者硬刪被拒")

g4 = Employee(name="丁", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
db.add(g4)
db.commit()
employee_service.hard_delete_employee(db, g4)
check(db.get(Employee, g4.id) is None, "無歷史資料者可硬刪")

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("RESIGNED EMPLOYEE ALL CHECKS PASSED")
sys.exit(0)
