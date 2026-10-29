"""大夜假別測試（v1.2.2-beta）：
- 排班表格位可直接排大夜假別（SPECIAL + leave_type，source=night_input）
- 休假管理新增/移除大夜假別時同步班表格位
- 鎖定月份不可從休假管理改大夜格位
- 清空大夜班表一併清除大夜假別紀錄
- 大夜 API（/night/{y}/{m}/{d}）支援假別
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
    LeaveType,
    ScheduleEntry,
    SpecialLeave,
)
from app.scheduler import data_loader, engine
from app.services import night_service, off_day_service, schedule_service, status_service

init_db()
db = SessionLocal()

Y, M = 2026, 8

night = Employee(
    name="劉冠群", nickname="Kuan", role="night",
    available_shifts='["D"]', preferred_shift="D", scheduling_mode="manual",
)
general = Employee(
    name="王怡昇", role="general",
    available_shifts='["A","B","C"]', scheduling_mode="auto",
)
tag_night = Employee(
    name="劉亮增", nickname="Brian", tag="二館", role="night",
    available_shifts='["D"]', preferred_shift="D", scheduling_mode="manual",
)
db.add_all([night, general, tag_night])
db.add(
    LeaveType(
        code="custom_typhoon",
        name="颱風假",
        color_bg="#dbeafe",
        color_text="#1e3a8a",
        is_builtin=0,
    )
)
db.commit()

passed = []


def check(name, cond):
    passed.append((name, cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}")


def entry(emp_id, day):
    db.expire_all()
    return db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.employee_id == emp_id,
            ScheduleEntry.year == Y,
            ScheduleEntry.month == M,
            ScheduleEntry.day == day,
        )
    ).first()


def leave(emp_id, day):
    db.expire_all()
    return db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.employee_id == emp_id,
            SpecialLeave.year == Y,
            SpecialLeave.month == M,
            SpecialLeave.day == day,
        )
    ).first()


print("=" * 70)
print("A. 排班表格位：大夜可排自訂假別")
print("=" * 70)

schedule_service.upsert_cell(
    db, night.id, Y, M, 1, "SPECIAL", leave_type="custom_typhoon"
)
e1 = entry(night.id, 1)
sl1 = leave(night.id, 1)
check(
    "1. 大夜排颱風假：格位 SPECIAL、source=night_input",
    e1 is not None and e1.shift == "SPECIAL" and e1.source == "night_input",
)
check(
    "2. 大夜排颱風假：寫入 special_leaves(leave_type=custom_typhoon)",
    sl1 is not None and sl1.leave_type == "custom_typhoon",
)

data = data_loader.load(db, Y, M)
check(
    "3. data_loader 將大夜假別讀入 night_schedule",
    data.night_schedule.get(night.id, {}).get(1) == "SPECIAL",
)

fixed = engine.build_fixed(data)
idx = data.emp_index()[night.id]
check("4. 求解固定格為 SPECIAL", fixed.get((idx, 0)) == "SPECIAL")

# 大夜改回休 → 假別紀錄同步移除
schedule_service.upsert_cell(db, night.id, Y, M, 1, "OFF")
check("5. 大夜改回休：格位變 OFF 且假別紀錄移除", entry(night.id, 1).shift == "OFF" and leave(night.id, 1) is None)

print("=" * 70)
print("B. 休假管理：大夜新增/移除假別同步格位")
print("=" * 70)

rc = off_day_service.add_special_leave(db, night.id, Y, M, 2, "custom_typhoon")
e2 = entry(night.id, 2)
check(
    "6. 休假管理新增：格位同步為 SPECIAL（night_input）",
    rc.leave_type == "custom_typhoon"
    and e2 is not None and e2.shift == "SPECIAL" and e2.source == "night_input",
)

# 原本已有 D，新增假別後應覆蓋為 SPECIAL
schedule_service.upsert_cell(db, night.id, Y, M, 3, "D")
off_day_service.add_special_leave(db, night.id, Y, M, 3, "SPECIAL")
check("7. 原本 D 的大夜格位，新增假別後變 SPECIAL", entry(night.id, 3).shift == "SPECIAL")

off_day_service.remove_special_leave(db, night.id, Y, M, 3)
check("8. 休假管理移除：格位變回 OFF 且假別移除", entry(night.id, 3).shift == "OFF" and leave(night.id, 3) is None)

# 一般員工維持原行為：只寫假別紀錄，不動已排好的格位
schedule_service.upsert_cell(db, general.id, Y, M, 3, "A")
off_day_service.add_special_leave(db, general.id, Y, M, 3, "custom_typhoon")
check(
    "9. 一般員工新增假別不直接改格位（回歸）",
    entry(general.id, 3).shift == "A" and leave(general.id, 3) is not None,
)

print("=" * 70)
print("C. 鎖定月份：不可從休假管理改大夜格位")
print("=" * 70)

status_service.set_status(db, Y, M, "locked")
try:
    off_day_service.add_special_leave(db, night.id, Y, M, 4, "custom_typhoon")
    check("10. 鎖定月份新增大夜假別被擋", False)
except PermissionError:
    db.rollback()
    check("10. 鎖定月份新增大夜假別被擋", True)
status_service.set_status(db, Y, M, "draft")

print("=" * 70)
print("D. 大夜 API 支援假別")
print("=" * 70)

night_service.save_night_entry(db, night.id, Y, M, 5, "SPECIAL", "custom_typhoon")
e5 = entry(night.id, 5)
sl5 = leave(night.id, 5)
check(
    "11. 大夜 API 可儲存假別",
    e5 is not None and e5.shift == "SPECIAL" and e5.source == "night_input"
    and sl5 is not None and sl5.leave_type == "custom_typhoon",
)

night_service.delete_night_entry(db, night.id, Y, M, 5)
check("12. 刪除大夜格位同時移除假別紀錄", entry(night.id, 5) is None and leave(night.id, 5) is None)

print("=" * 70)
print("E. 清空大夜班表：一併清除大夜假別，保留一般員工假別")
print("=" * 70)

off_day_service.add_special_leave(db, night.id, Y, M, 6, "custom_typhoon")
off_day_service.add_special_leave(db, night.id, Y, M, 7, "SPECIAL")
cleared = night_service.clear_night_schedule(db, Y, M)
check("13. 清空大夜回傳清除筆數", cleared > 0)
check(
    "14. 清空後大夜格位與假別皆移除",
    entry(night.id, 6) is None
    and leave(night.id, 6) is None
    and leave(night.id, 7) is None,
)
check("15. 一般員工假別不受清空大夜影響（回歸）", leave(general.id, 3) is not None)

print("=" * 70)
print("F. 二館支援大夜仍不可排假別（維持原規則）")
print("=" * 70)

try:
    schedule_service.upsert_cell(db, tag_night.id, Y, M, 8, "SPECIAL")
    check("16. 二館支援大夜排 SPECIAL 被擋", False)
except ValueError:
    check("16. 二館支援大夜排 SPECIAL 被擋", True)

off_day_service.add_special_leave(db, tag_night.id, Y, M, 9, "custom_typhoon")
check(
    "17. 二館支援假別只留休假紀錄、不寫入支援班格位",
    entry(tag_night.id, 9) is None and leave(tag_night.id, 9) is not None,
)

try:
    night_service.save_night_entry(db, tag_night.id, Y, M, 10, "D")
    check("18. 二館支援不可用大夜 API 排 D", False)
except ValueError:
    check("18. 二館支援不可用大夜 API 排 D", True)

print("=" * 70)
failed = [name for name, ok in passed if not ok]
if failed:
    print(f"FAILED: {len(failed)} 項 -> {failed}")
    sys.exit(1)
print(f"ALL CHECKS PASSED ({len(passed)} 項)")
