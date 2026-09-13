"""跨月銜接：二館支援（tag）員工排除測試（v1.1.5-beta）。

tag 員工為外部手動排班、豁免所有規則，其 A1/C1/D1 不屬跨月班次域，
不得被自動載入、不得出現在讀取/預覽，儲存時也不可因 D1 而整批失敗。
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
from app.database.models import Employee, PreviousMonthLink, ScheduleEntry
from app.services import cross_month_service

init_db()
db = SessionLocal()

general = Employee(
    name="一般", role="general", available_shifts='["A","B","C"]',
    preferred_shift=None, scheduling_mode="auto",
)
tagged = Employee(
    name="二館支援", role="general", tag="二館", available_shifts='["A"]',
    preferred_shift=None, scheduling_mode="manual",
)
db.add_all([general, tagged])
db.commit()

# 上月（2026-09）最後 5 天：一般排 A，tag 排 D1
for day in range(26, 31):
    db.add(ScheduleEntry(employee_id=general.id, year=2026, month=9, day=day,
                         shift="A", source="manual"))
    db.add(ScheduleEntry(employee_id=tagged.id, year=2026, month=9, day=day,
                         shift="D1", source="night_input"))
db.commit()

passed = []


def check(name, cond):
    passed.append((name, cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}")


print("=" * 70)
print("跨月銜接：tag 員工排除")
print("=" * 70)

auto = cross_month_service.auto_load_from_prev_month(db, 2026, 10)
links = cross_month_service.get_cross_month_links(db, 2026, 10)["previous_month_links"]
check("1. 自動載入成功", auto)
check("2. 非 tag 員工正常載入", str(general.id) in links
      and links[str(general.id)]["day_1_shift"] == "A")
check("3. tag 員工不出現在讀取結果", str(tagged.id) not in links)
check("4. tag 員工不寫入 previous_month_links",
      db.scalars(select(PreviousMonthLink).where(
          PreviousMonthLink.employee_id == tagged.id)).first() is None)

saved = None
try:
    cross_month_service.save_cross_month_links(db, 2026, 10, [
        {"employee_id": tagged.id, "day_5_shift": "D1", "day_4_shift": "D1",
         "day_3_shift": "D1", "day_2_shift": "D1", "day_1_shift": "D1"},
        {"employee_id": general.id, "day_5_shift": "A", "day_4_shift": "B",
         "day_3_shift": "C", "day_2_shift": "OFF", "day_1_shift": "A"},
    ])
    saved = True
except ValueError as exc:
    saved = f"ValueError: {exc}"
check("5. 儲存含 tag D1 不再整批失敗", saved is True)

links2 = cross_month_service.get_cross_month_links(db, 2026, 10)["previous_month_links"]
check("6. 儲存後仍保留非 tag、排除 tag",
      str(general.id) in links2 and str(tagged.id) not in links2)

preview = cross_month_service.get_cross_month_preview(db, 2026, 10)
preview_ids = [s["employee_id"] for s in preview["cross_month_week_summary"]]
check("7. 銜接預覽不含 tag 員工", tagged.id not in preview_ids)

# 大夜：上月末連上 5 天 D、本月 1 日尚未輸入 → 不應報 H5/H4，但仍保留週休假摘要列
night = Employee(
    name="大夜", role="night", available_shifts='["D"]',
    preferred_shift="D", scheduling_mode="manual",
)
db.add(night)
db.commit()
for day in range(26, 31):
    db.add(ScheduleEntry(employee_id=night.id, year=2026, month=9, day=day,
                         shift="D", source="night_input"))
db.commit()
cross_month_service.auto_load_from_prev_month(db, 2026, 10)
preview = cross_month_service.get_cross_month_preview(db, 2026, 10)
night_violations = [v for v in preview["violations"] if v["employee_id"] == night.id]
check("8. 大夜不報 H5/H4 假違規", night_violations == [])
check("9. 大夜仍保留在週休假摘要",
      night.id in [s["employee_id"] for s in preview["cross_month_week_summary"]])

print("=" * 70)
failed = [name for name, ok in passed if not ok]
if failed:
    print(f"FAILED: {len(failed)} 項 -> {failed}")
    sys.exit(1)
print(f"ALL CHECKS PASSED ({len(passed)} 項)")
