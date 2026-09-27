"""店長卡班上限（manager_backup_cap）測試。

規則：每月設定 `manager_backup_cap:{y}:{m}` = 每位管理職（店長）可被排 A/C
的格數上限；留空 = 不限制。超過上限的缺口由 solve 流程自動轉為支援請求。
"""

import os
import sys
import tempfile
from datetime import date

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select

from app.database.connection import SessionLocal, init_db
from app.database.models import Employee, SpecialLeave, SupportRequest
from app.scheduler import data_loader, engine
from app.services import settings_service, support_service

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


Y, M = 2026, 6
KEY = f"manager_backup_cap:{Y}:{M}"

g1 = Employee(name="一般甲", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
g2 = Employee(name="一般乙", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
mgr = Employee(name="店長", role="manager", available_shifts='["M","A","B","C","D"]', preferred_shift="M", scheduling_mode="auto")
db.add_all([g1, g2, mgr])
db.commit()


def mgr_ac(result):
    row = (result.schedule or {}).get("店長", [])
    return sum(1 for s in row if s in ("A", "C"))


def add_support(gaps):
    day_a, day_c = gaps
    for d in sorted(day_a):
        support_service.create_auto_support(db, Y, M, d, "A", reason="test")
    for d in sorted(day_c):
        support_service.create_auto_support(db, Y, M, d, "C", reason="test")


# --- 1. 未設定上限 → 不限制，店長會大量卡 A/C ---
data = data_loader.load(db, Y, M)
check(data.manager_backup_cap is None, "未設定時 manager_backup_cap = None")
r = engine.solve(data, max_time=30)
check(r.success, "無上限時求解成功")
base = mgr_ac(r)
check(base > 3, f"無上限時店長卡 A/C {base} 天 (>3)")

# --- 2. 上限 0：無支援 → 失敗 ---
settings_service.set_setting(db, KEY, "0")
data = data_loader.load(db, Y, M)
check(data.manager_backup_cap == 0, "讀取每月上限 = 0")
check(not engine.solve(data, max_time=30).success, "上限 0 且無支援 → 求解失敗")

# --- 3. 上限 0 + 自動支援 → 成功，店長完全不卡 A/C ---
gaps = engine.diagnose_support_needs(data)
check(gaps is not None, "上限 0 仍可診斷出支援需求")
if gaps:
    add_support(gaps)
    data = data_loader.load(db, Y, M)
    r0 = engine.solve(data, max_time=30)
    check(r0.success, "上限 0 + 支援後求解成功")
    check(mgr_ac(r0) == 0, f"上限 0 時店長 A/C = 0 (實際 {mgr_ac(r0)})")

# --- 4. 上限 3 + 適量支援 → 成功且店長 A/C ≤ 3 ---
for rec in db.scalars(select(SupportRequest)):
    db.delete(rec)
db.commit()
settings_service.set_setting(db, KEY, "3")
data = data_loader.load(db, Y, M)
check(data.manager_backup_cap == 3, "讀取每月上限 = 3")
gaps3 = engine.diagnose_support_needs(data)
check(gaps3 is not None, "上限 3 仍可診斷支援需求")
if gaps3:
    n = len(gaps3[0]) + len(gaps3[1])
    check(n > 0, f"上限 3 需支援 {n} 格")
    add_support(gaps3)
    data = data_loader.load(db, Y, M)
    r3 = engine.solve(data, max_time=30)
    check(r3.success, "上限 3 + 支援後求解成功")
    check(mgr_ac(r3) <= 3, f"上限 3 時店長 A/C ≤ 3 (實際 {mgr_ac(r3)})")

# --- 5. 空字串 → 視為不限制 ---
settings_service.set_setting(db, KEY, "")
data = data_loader.load(db, Y, M)
check(data.manager_backup_cap is None, "空字串視為不限制")

# --- 6. 臨時異動（solve_adjust）不受卡班上限阻擋 ---
data = data_loader.load(db, Y, M)
rbase = engine.solve(data, max_time=30)
check(rbase.success, "（前置）取得基準班表")
db.add(SpecialLeave(employee_id=g1.id, year=Y, month=M, day=15, leave_type="SPECIAL"))
db.commit()
settings_service.set_setting(db, KEY, "0")
data = data_loader.load(db, Y, M)
check(data.manager_backup_cap == 0, "臨時異動情境：上限 0")
adj = engine.solve_adjust(data, rbase.schedule, g1.id, date(Y, M, 1), max_time=30)
check(adj.success, f"上限 0 時臨時異動仍可求解（{adj.error}）")
if adj.success:
    check(mgr_ac(adj) > 0, f"臨時異動不受卡班上限硬性阻擋（店長 A/C={mgr_ac(adj)}）")

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("MANAGER BACKUP CAP ALL CHECKS PASSED")
sys.exit(0)
