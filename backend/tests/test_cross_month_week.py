"""跨月銜接 6 天（v1.2.0）與 H9 跨月週計數測試。

背景：`previous_month_links` 由 5 天擴充為 6 天。原因是本月 1 日為週日時，
跨月週（週一制）含上月 6 天（週一~週六），第 6 天（上月週一）若為休假日，
舊版以 min(weekday_day1, 5) 只數 5 天 → 漏算週一休假 → H9 會誤強加/誤算休假。

- auto_load 需載入 6 天（含 day_6 = 上月倒數第 6 天）。
- H9/驗證器在「1 日為週日」時需把上月週一算進去。
- 舊資料缺 day_6（NULL）時，視為資料不足 → 退回 H2 式判斷（不誤加休假）。
"""

import calendar
import os
import sys
import tempfile
from datetime import date

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import Employee, PreviousMonthLink, ScheduleEntry
from app.scheduler import data_loader, validator
from app.services import cross_month_service

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


Y, M = 2026, 3  # 2026-03-01 為週日（weekday=6）
ND = calendar.monthrange(Y, M)[1]
assert date(Y, M, 1).weekday() == 6

emp = Employee(
    name="甲", role="general", available_shifts='["A","B","C"]',
    preferred_shift=None, scheduling_mode="auto",
)
db.add(emp)
db.commit()

# 上月（2026-02）最後 6 天 = 2/23(一)~2/28(六)：
#   2/23(一) 休、2/27(五) 休，其餘上班 → 該跨月週（週一制）已休 2 天（一、五）
db.add(ScheduleEntry(employee_id=emp.id, year=2026, month=2, day=23, shift="OFF", source="auto"))
db.add(ScheduleEntry(employee_id=emp.id, year=2026, month=2, day=27, shift="OFF", source="auto"))
for d in (24, 25, 26, 28):
    db.add(ScheduleEntry(employee_id=emp.id, year=2026, month=2, day=d, shift="A", source="auto"))
db.commit()

# 1. auto_load 需載入 6 天
auto = cross_month_service.auto_load_from_prev_month(db, Y, M)
check(auto, "auto_load 成功")
data_links = cross_month_service.get_cross_month_links(db, Y, M)
link = data_links["previous_month_links"][str(emp.id)]
check(link["day_6_shift"] == "OFF", "day_6（上月週一 2/23）已載入 = 休")
check(link["day_2_shift"] == "OFF", "day_2（2/27）載入 = 休")
check(len(data_links["prev_last_dates"]) == 6, "回傳最後 6 天日期清單")

# 2. data_loader previous_month 清單長度 = 6，且第 0 項為 day_6
data = data_loader.load(db, Y, M)
pm = data.previous_month[emp.id]
check(len(pm) == 6, "data_loader previous_month 長度 = 6")
check(pm[0] == "OFF" and pm[-1] == "A", "previous_month 內容（舊→新）正確")

# 3. 預覽：1 日為週日需把上月週一算入 → 已休 2 天、本月可休 0
preview = cross_month_service.get_cross_month_preview(db, Y, M)
row = next(s for s in preview["cross_month_week_summary"] if s["employee_id"] == emp.id)
check(row["prev_week_off_count"] == 2, "預覽上月部分已休 = 2（含週一）")
check(row["remaining_off"] == 0, "預覽本月可休 = 0")
check(row["at_limit"] is True, "預覽已達上限")

# 4. 驗證器 H9：跨月週共 2 天 → 3/1 應上班
def h9_violations(day1_shift):
    row = ["A"] * ND
    row[0] = day1_shift
    viols = validator.validate(data, {emp.id: row})
    return [v for v in viols if v["rule"] == "H9"]


check(h9_violations("A") == [], "3/1 上班 → H9 無違規（跨月週共 2 天）")
v = h9_violations("OFF")
check(len(v) == 1 and "3" in v[0]["message"], "3/1 也休 → H9 違規（跨月週共 3 天）")

# 5. 舊資料缺 day_6（NULL）→ 視為資料不足，不誤加休假
db.query(PreviousMonthLink).filter(PreviousMonthLink.employee_id == emp.id).update(
    {"day_6_shift": None}
)
db.commit()
data2 = data_loader.load(db, Y, M)
preview2 = cross_month_service.get_cross_month_preview(db, Y, M)
row2 = next(s for s in preview2["cross_month_week_summary"] if s["employee_id"] == emp.id)
check(row2["remaining_off"] is None, "缺 day_6 → 本月可休顯示未知（None）")
v_off = [x for x in validator.validate(data2, {emp.id: ["OFF"] * ND}) if x["rule"] == "H9"]
check(v_off == [], "缺 day_6 → 驗證器不報 H9（資料不足）")

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("CROSS-MONTH 6-DAY ALL CHECKS PASSED")
sys.exit(0)
