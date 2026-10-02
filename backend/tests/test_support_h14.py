"""H14：一天最多一個支援請求（A/C 合計）測試。

- 手動/自動建立支援請求時，同日（day>0）已有任何請求 → 擋下。
- 全月請求（day=0）不受同日限制。
- validator 對同日的多筆請求報 H14 違規。
- 自動偵測缺班（diagnose_support_needs / _coverage_gaps）同日只產生一筆，優先 C。
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
from app.database.models import Employee, SpecialLeave, SupportRequest
from app.scheduler import data_loader, engine, validator
from app.services import support_service
init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


Y, M = 2026, 9

# 兩位一般員工：某日全排特休 → 該日 A、C 皆缺（同日需兩班）。
g1 = Employee(name="甲", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
g2 = Employee(name="乙", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
db.add_all([g1, g2])
db.commit()

# --- 1. 手動建立：同日第二筆被擋 ---
support_service.create_support_request(db, Y, M, 10, "C", reason="手動")
try:
    support_service.create_support_request(db, Y, M, 10, "A", reason="手動")
    check(False, "手動：同日已有請求時第二筆應被擋")
except ValueError:
    check(True, "手動：同日已有請求時第二筆被擋")

# --- 2. 自動建立：同日第二筆被擋 ---
try:
    support_service.create_auto_support(db, Y, M, 10, "A", reason="auto")
    check(False, "自動：同日已有請求時應被擋")
except ValueError:
    check(True, "自動：同日已有請求時被擋")

# --- 3. 不同日不受影響 ---
support_service.create_support_request(db, Y, M, 11, "A", reason="手動")
check(True, "不同日可各自建立請求")

# --- 4. 全月請求（day=0）不受同日限制，可同時 A、C ---
support_service.create_support_request(db, Y, M, 0, "A", reason="全月")
support_service.create_support_request(db, Y, M, 0, "C", reason="全月")
check(True, "全月請求（day=0）不受同日限制")

# 清掉前面手動建立的，避免干擾後續診斷（診斷結果會受 external_support 影響）
for rec in db.scalars(select(SupportRequest)):
    db.delete(rec)
db.commit()

# --- 5. validator：同日的兩筆請求 → H14 違規 ---
support_service.create_support_request(db, Y, M, 12, "C", reason="x")
db.add(SupportRequest(year=Y, month=M, day=12, shift="A", source="manual"))
db.commit()
data = data_loader.load(db, Y, M)
check(data.support_requests.get(12) == {"A", "C"}, "data.support_requests 記錄同日兩班")
viols = validator.validate(data, {})
h14 = [v for v in viols if v["rule"] == "H14"]
check(len(h14) == 1, f"validator 報 1 筆 H14（實際 {len(h14)}）")
check(h14 and h14[0]["day"] == 12, "H14 指向 9/12")

for rec in db.scalars(select(SupportRequest)):
    db.delete(rec)
db.commit()

# --- 6. 自動偵測缺班（ea+ec<=1：一天外部只能填一個班）---
# 情境 A：9/20 兩位一般員工皆特休 → A、C 兩班皆缺、又無 manager 可補，
# 一天一個支援補不完 → 診斷模型不可行（diag=None → 求解會失敗，屬 H14 正確行為）。
for g in (g1, g2):
    db.add(SpecialLeave(employee_id=g.id, year=Y, month=M, day=20, leave_type="SPECIAL"))
db.commit()

data = data_loader.load(db, Y, M)
diag = engine.diagnose_support_needs(data)
check(diag is None, "同日 A、C 皆缺且無人可吸收 → 診斷不可行（None）")

# 情境 B：加上 manager（可上 A/B/C/D）→ 9/20 內部由 manager 補一個班，
# 外部支援只補一個班 → 診斷可行、且同日只在其中一個集合、外部優先 A。
mgr = Employee(name="店長", role="manager", available_shifts='["M","A","B","C","D"]', preferred_shift="M", scheduling_mode="auto")
db.add(mgr)
db.commit()

data = data_loader.load(db, Y, M)
diag = engine.diagnose_support_needs(data)
check(diag is not None, "有 manager 時可診斷出支援需求")
day_a, day_c = diag if diag else (set(), set())
check(20 in (day_a or set()) and 20 not in (day_c or set()), f"9/20 外部優先請求 A（day_a={sorted(day_a or set())}）")

from app.api.routes.solve import _coverage_gaps

gaps = _coverage_gaps(data)
days = [g["day"] for g in gaps if g["day"] > 0]
check(len(days) == len(set(days)), "H14：同日只產生一筆支援請求")
g20 = [g for g in gaps if g["day"] == 20]
check(len(g20) == 1 and g20[0]["shift"] == "A", "H14：外部人力優先上 A")

# --- 7. 只補一個支援（9/20 C）→ 重建請求成功 ---
created = support_service.generate_from_gaps(db, g20, Y, M)
check(len(created) == 1, "只補 1 筆支援請求")

# --- 8. 「清空班表」副作用：支援請求全清 + 狀態回草稿；鎖定月份須先解鎖 ---
from app.services import schedule_service, status_service as _ss

# 8a. 鎖定 → 清空被拒
_ss.set_status(db, Y, M, "locked")
try:
    schedule_service.clear_month_schedule(db, Y, M)
    check(False, "鎖定時清空應被拒")
except PermissionError:
    check(True, "鎖定時清空被拒（請先解鎖）")

# 8b. 解鎖後清空：schedule_entries（含 night_input? front 保留）、支援請求、狀態
_ss.set_status(db, Y, M, "draft")
schedule_service.upsert_cell(db, g1.id, Y, M, 10, "A")
cleared = schedule_service.clear_month_schedule(db, Y, M)
check(cleared >= 1, "清空班表有刪到格位")
reqs_after = support_service.get_support_requests(db, Y, M)
check(reqs_after == [], "清空班表連同支援請求（手動/自動）一併清除")
check(_ss.get_status(db, Y, M) == "draft", "清空班表後狀態為草稿")

db.close()
print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("H14 (ONE SUPPORT PER DAY) ALL CHECKS PASSED")
sys.exit(0)
