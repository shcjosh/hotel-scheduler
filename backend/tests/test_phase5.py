import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import Employee, ScheduleEntry
from app.services import (
    change_log_service,
    schedule_service,
    snapshot_service,
    status_service,
)

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


def cell(emp_id, day):
    view = schedule_service.get_month_view(db, 2026, 8, 31)
    name = next(e.name for e in [wang, lee] if e.id == emp_id)
    return view["schedule"][name][day - 1]


wang = Employee(name="王先生", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
lee = Employee(name="李小姐", role="general", available_shifts='["A","B","C"]', preferred_shift="A", scheduling_mode="auto")
db.add_all([wang, lee])
db.commit()

db.add(ScheduleEntry(employee_id=wang.id, year=2026, month=8, day=1, shift="A", source="auto"))
db.add(ScheduleEntry(employee_id=lee.id, year=2026, month=8, day=1, shift="C", source="auto"))
db.commit()

# 1. 預設 draft
check(status_service.get_status(db, 2026, 8) == "draft", "預設狀態 draft")

# 2. publish → 自動快照
status_service.publish(db, 2026, 8)
check(status_service.get_status(db, 2026, 8) == "published", "發布後 published")
snaps = snapshot_service.list_snapshots(db, 2026, 8)
check(len(snaps) == 1, f"發布自動建立快照 (實際 {len(snaps)})")
check(snaps[0].name == "正式發布版", "發布快照名稱正確")

# 3. published 手動改格 → 寫 change log
schedule_service.upsert_cell(db, wang.id, 2026, 8, 1, "B", reason="與同仁換班")
logs = change_log_service.list_change_logs(db, 2026, 8)
check(len(logs) == 1, f"published 改格寫入 change log (實際 {len(logs)})")
check(
    logs[0].old_shift == "A" and logs[0].new_shift == "B" and logs[0].reason == "與同仁換班",
    "change log 內容 (舊/新/原因) 正確",
)

# 4. 手動快照 + 還原
snap = snapshot_service.create_snapshot(db, 2026, 8, name="調整大夜前備份")
check(len(snapshot_service.list_snapshots(db, 2026, 8)) == 2, "手動快照建立")
check(cell(wang.id, 1) == "B", "快照前 王 8/1 = B")
schedule_service.upsert_cell(db, wang.id, 2026, 8, 1, "C")
check(cell(wang.id, 1) == "C", "改格後 王 8/1 = C")
snapshot_service.restore_snapshot(db, snap.id)
check(cell(wang.id, 1) == "B", "還原後 王 8/1 回到 B")

# 5. locked 拒絕修改
status_service.lock(db, 2026, 8)
check(status_service.get_status(db, 2026, 8) == "locked", "鎖定狀態")
try:
    schedule_service.upsert_cell(db, wang.id, 2026, 8, 1, "A")
    check(False, "locked 應拒絕修改")
except PermissionError:
    check(True, "locked 拒絕格位修改")

status_service.unlock(db, 2026, 8)
check(status_service.get_status(db, 2026, 8) == "draft", "解鎖回 draft")

# 6. diff 比對
snap_a = snapshot_service.create_snapshot(db, 2026, 8, name="比對 A")
schedule_service.upsert_cell(db, wang.id, 2026, 8, 1, "C")
snap_b = snapshot_service.create_snapshot(db, 2026, 8, name="比對 B")
diff = snapshot_service.diff_snapshots(db, snap_a.id, snap_b.id)
check(len(diff["changes"]) == 1, f"diff 找出 1 處差異 (實際 {len(diff['changes'])})")
if diff["changes"]:
    c = diff["changes"][0]
    check(
        c["employee_id"] == wang.id and c["old_shift"] == "B" and c["new_shift"] == "C",
        "diff 內容 (王 8/1 B→C) 正確",
    )

# 7. 無效狀態拒絕
try:
    status_service.set_status(db, 2026, 8, "weird")
    check(False, "無效狀態應拒絕")
except ValueError:
    check(True, "無效狀態拒絕")

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("MODULE 2 ALL CHECKS PASSED")
sys.exit(0)
