"""房務（housekeeping）角色行為測試。

- 角色預設：只上 A、手動。
- 房務格位（schedule_entries）與櫃台互不干涉：分群查詢、求解/驗證排除。
- 房務手動排班只允許 A / 休（OFF）/ 空，且完全跳過規則檢測。
- 統計 / 休假日曆 / 跨月 / 特休 等櫃台功能排除房務。
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
from app.scheduler import data_loader
from app.schemas.employee import EmployeeCreate, ROLE_DEFAULTS
from app.services import (
    cross_month_service,
    employee_service,
    off_day_service,
    schedule_service,
    stats_service,
)

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


Y, M = 2026, 9
NUM_DAYS = calendar.monthrange(Y, M)[1]

# 1. 角色預設
check(ROLE_DEFAULTS["housekeeping"]["available_shifts"] == ["A"], "房務預設班次只有 A")
check(ROLE_DEFAULTS["housekeeping"]["scheduling_mode"] == "manual", "房務預設為手動")

hk = employee_service.create_employee(db, EmployeeCreate(name="房務甲", role="housekeeping"))
check(hk.available_shifts == '["A"]', "建立房務後 available_shifts = A")
check(hk.scheduling_mode == "manual", "建立房務後為手動")

front = employee_service.create_employee(
    db, EmployeeCreate(name="櫃台甲", role="general")
)

# 2. 分群查詢
view_front = schedule_service.get_month_view(db, Y, M, NUM_DAYS)
check("房務甲" not in view_front["schedule"], "櫃台分群不含房務")
check("櫃台甲" in view_front["schedule"], "櫃台分群含一般員工")

view_hk = schedule_service.get_month_view(db, Y, M, NUM_DAYS, group="housekeeping")
check("房務甲" in view_hk["schedule"], "房務分群含房務")
check("櫃台甲" not in view_hk["schedule"], "房務分群不含櫃台")

# 3. 房務手動排班限制
schedule_service.upsert_cell(db, hk.id, Y, M, 1, "A")
day1 = [
    e for e in schedule_service.list_entries(db, employee_id=hk.id, year=Y, month=M, day=1)
]
check(len(day1) == 1 and day1[0].shift == "A", "房務可排 A")
check(day1[0].source == "manual", "房務格位來源為 manual")

schedule_service.upsert_cell(db, hk.id, Y, M, 1, "OFF")
day1 = schedule_service.list_entries(db, employee_id=hk.id, year=Y, month=M, day=1)
check(day1[0].shift == "OFF", "房務可改為休")

rejected = False
try:
    schedule_service.upsert_cell(db, hk.id, Y, M, 2, "B")
except ValueError:
    rejected = True
check(rejected, "房務不可排 B")

rejected = False
try:
    schedule_service.upsert_cell(db, hk.id, Y, M, 2, "D")
except ValueError:
    rejected = True
check(rejected, "房務不可排 D")

# 4. validate_cell 完全跳過檢測
vr = schedule_service.validate_cell(db, hk.id, Y, M, 5, "A")
check(vr["violations"] == [] and vr["warnings"] == [], "房務格位驗證不報任何規則")

# 5. 求解名單排除房務
data = data_loader.load(db, Y, M)
check("房務甲" not in {e.name for e in data.employees}, "求解名單排除房務")

# 6. 統計 / 休假日曆 / 跨月 / 特休 排除房務
stats = stats_service.get_month_stats(db, Y, M)
check(
    all(row["employee_name"] != "房務甲" for row in stats["per_employee"]),
    "統計報表排除房務",
)
summary = off_day_service.get_off_day_summary(db, Y, M)
check(str(hk.id) not in summary, "休假日曆摘要排除房務")
preview = cross_month_service.get_cross_month_preview(db, Y, M)
names = {e["name"] for e in preview.get("employees", [])}
check("房務甲" not in names, "跨月預覽排除房務")

# 7. 前端櫃台班表若仍用預設分群，房務格位不會出現
view_hk2 = schedule_service.get_month_view(db, Y, M, NUM_DAYS, group="housekeeping")
check(view_hk2["schedule"]["房務甲"][0] == "OFF", "房務分群可讀到剛排的休")

# 8. 清空房務不影響櫃台
db.add(ScheduleEntry(employee_id=front.id, year=Y, month=M, day=1, shift="A", source="manual"))
db.commit()
cleared = schedule_service.clear_month_schedule(db, Y, M, group="housekeeping")
check(cleared >= 1, "清空房務有刪到房務格位")
check(
    schedule_service.list_entries(db, employee_id=front.id, year=Y, month=M) != [],
    "清空房務不動櫃台格位",
)
check(
    schedule_service.list_entries(db, employee_id=hk.id, year=Y, month=M) == [],
    "房務格位已清空",
)

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("HOUSEKEEPING ALL CHECKS PASSED")
sys.exit(0)
