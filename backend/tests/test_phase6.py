import dataclasses
import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import (
    Employee,
    PreviousMonthLink,
    ScheduleEntry,
    SpecialLeave,
)
from app.scheduler import data_loader, diagnostics, engine, validator
from app.services import support_service

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


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

night = {1: "D", 2: "OFF", 3: "OFF", 4: "OFF", 5: "D", 6: "D", 7: "D", 8: "D", 9: "D", 10: "OFF",
         11: "D", 12: "D", 13: "D", 14: "OFF", 15: "D", 16: "D", 17: "OFF", 18: "OFF", 19: "D",
         20: "D", 21: "D", 22: "D", 23: "D", 24: "OFF", 25: "D", 26: "D", 27: "D", 28: "OFF",
         29: "D", 30: "D", 31: "D"}
for day, sh in night.items():
    db.add(ScheduleEntry(employee_id=chen.id, year=2026, month=8, day=day, shift=sh, source="night_input"))
db.commit()

# 0. 乾淨資料（無休假缺口）→ diagnose_support_needs 不應誤報
data_clean = data_loader.load(db, 2026, 8)
no_a0, no_c0 = engine.diagnose_support_needs(data_clean)
check(len(no_a0) == 0 and len(no_c0) == 0, f"可行資料無誤報 (no_a={sorted(no_a0)}, no_c={sorted(no_c0)})")

# 三位一般員工 day 20 全排特休 → day 20 A 班無人可上（cd_backup 只能 C/D）
for g in (wang, lee, chang):
    db.add(SpecialLeave(employee_id=g.id, year=2026, month=8, day=20, leave_type="SPECIAL"))
db.commit()

data = data_loader.load(db, 2026, 8)

# 1. diagnose_support_needs 找出 day 20 A 班缺人（C 班由 cd_backup 可補）
no_a, no_c = engine.diagnose_support_needs(data)
check(20 in no_a, f"診斷找出 8/20 A 班缺人 (no_a={sorted(no_a)})")
check(20 not in no_c, "C 班不誤報（cd_backup 可補）")

# 2. 無支援時求解 → 失敗
r0 = engine.solve(data, max_time=30)
check(not r0.success, "無支援時求解失敗（day 20 A 不可行）")

# 3. 自動產生支援請求 → resolved + auto + 標記
created = support_service.generate_from_gaps(
    db, [{"day": 20, "shift": "A", "reason": "20 日 A 班人力不足"}], 2026, 8
)
check(len(created) == 1, f"自動產生 1 筆支援請求 (實際 {len(created)})")
if created:
    c = created[0]
    check(c["day"] == 20 and c["shift"] == "A", "支援請求為 8/20 A 班")
    check(c["status"] == "resolved" and c["source"] == "auto", "狀態 resolved + 來源 auto")
    check(c["resolution"] == "需要支援的人力", "標明需要支援的人力")

# 4. 重新載入 → external_support 生效
data2 = data_loader.load(db, 2026, 8)
check(data2.is_external(20, "A"), "reload 後 day 20 A 視為外部支援")
check(not data2.is_external(20, "C"), "day 20 C 非外部支援")

# 5. 有支援後求解 → 成功
r1 = engine.solve(data2, max_time=30)
check(r1.success, "有支援後求解成功")

# 6. validator 不標 day 20 A 班無人
if r1.success:
    name_to_id = {e.name: e.id for e in data2.employees}
    sched_by_id = {name_to_id[nm]: row for nm, row in r1.schedule.items()}
    viols = validator.validate(data2, sched_by_id)
    a_none = [v for v in viols if v["rule"] == "H1" and v["day"] == 20 and "A 班無人" in v["message"]]
    check(len(a_none) == 0, "validator 不標 day 20 A 班無人（外部支援）")
    check(all(v["rule"] != "H1" for v in viols), f"無其他 H1 違規 (H1違規數={len([v for v in viols if v['rule']=='H1'])})")

# 7. 全月結構性缺班：無 A 可上 → 每天皆無 A
no_a_data = dataclasses.replace(
    data,
    employees=[dataclasses.replace(e, available_shifts=["B", "C"]) if e.role == "general" else e for e in data.employees],
)
no_a2, _ = engine.diagnose_support_needs(no_a_data)
check(len(no_a2) == data.num_days, f"全月無 A 可上 → 每天無 A (實際 {len(no_a2)} 天)")

# 8. H3 週末休假衝突：李小姐一堆平日特休 → 被迫週末休 >2
bunch = [3, 6, 7, 10, 11, 13, 14, 17, 18, 20, 21, 24, 25, 27, 28, 31]
h3_data = dataclasses.replace(data, special_leaves={lee.id: bunch})
mand = diagnostics._mandatory_weekend_off(h3_data, lee.id)
check(mand > 2, f"H3 衝突偵測：李小姐被迫週末休 {mand} 天 (>2)")
h3_causes = diagnostics.diagnose_detailed(h3_data)["likely_causes"]
check(
    any(c["type"] == "leave_weekend_conflict" for c in h3_causes),
    "診斷回報 leave_weekend_conflict 原因",
)

# 9. H2 整週特休衝突：王先生特休涵蓋整週 → 一般休不足
whole_week = list(range(3, 10))  # 8/3~8/9
h2_data = dataclasses.replace(data, special_leaves={wang.id: whole_week})
short = diagnostics._weekly_off_shortage(h2_data, wang.id)
check(len(short) > 0 and short[0]["shortage"] >= 2, f"H2 整週特休偵測 (shortage={short})")
h2_causes = diagnostics.diagnose_detailed(h2_data)["likely_causes"]
check(
    any(c["type"] == "weekly_off_shortage" for c in h2_causes),
    "診斷回報 weekly_off_shortage 原因",
)

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("MODULE 6 (AUTO-SUPPORT) ALL CHECKS PASSED")
sys.exit(0)
