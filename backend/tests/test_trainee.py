"""見習生（trainee）角色測試。

- 角色預設：只能上 A/B/C、自動排班。
- H15 見習同行：
  * A/C 班需同班有一位非見習人員。
  * B 班需同日 A、C 都有非見習人員（B 時段與 A/C 重疊）。
  * B 班本身仍最多 1 人。
- 見習生完整套用 H2/H3/H4/H12 等一般休假規則。
- 格位驗證與 API 寫入限制。
"""

import copy
import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import Employee
from app.scheduler import data_loader, diagnostics, engine, validator
from app.schemas.employee import EmployeeCreate, ROLE_DEFAULTS
from app.services import employee_service, schedule_service, stats_service

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


Y, M = 2026, 6

# --- 1. 角色預設與建立 ---
check(
    ROLE_DEFAULTS["trainee"]["available_shifts"] == ["A", "B", "C"],
    "見習生預設班次為 A/B/C",
)
check(
    ROLE_DEFAULTS["trainee"]["scheduling_mode"] == "auto",
    "見習生預設自動排班",
)

trainee = employee_service.create_employee(
    db, EmployeeCreate(name="見習甲", role="trainee")
)
check(trainee.available_shifts == '["A", "B", "C"]', "建立見習生後 available_shifts = A/B/C")
check(trainee.scheduling_mode == "auto", "建立見習生後為自動排班")

try:
    employee_service.create_employee(
        db,
        EmployeeCreate(name="見習乙", role="trainee", available_shifts=["A", "D"]),
    )
    check(False, "見習生不可設定 D 班")
except ValueError:
    check(True, "見習生不可設定 D 班")

try:
    employee_service.create_employee(
        db,
        EmployeeCreate(name="見習乙", role="trainee", scheduling_mode="manual"),
    )
    check(False, "見習生目前僅支援自動排班")
except ValueError:
    check(True, "見習生目前僅支援自動排班")


def add_general(name, pref=None):
    return employee_service.create_employee(
        db, EmployeeCreate(name=name, role="general", preferred_shift=pref)
    )


# 五位一般櫃台 + 一位見習生，讓 H2/H3/H12 與 H15 有足夠空間。
generals = [add_general(f"一般{i}") for i in range(1, 6)]

data = data_loader.load(db, Y, M)
result = engine.solve(data, max_time=30)
check(result.success, "含見習生的班表可求解")
if not result.success:
    print("SOLVE FAILED:", result.error)
    for cause in (result.diagnostics or {}).get("likely_causes", []):
        print("  -", cause["message"])

if result.success and result.schedule:
    trainee_name = "見習甲"
    trainee_row = result.schedule[trainee_name]
    non_trainee_names = [e.name for e in data.employees if e.role != "trainee"]

    pair_ok = True
    b_cap_ok = True
    no_dm_ok = True
    for d, shift in enumerate(trainee_row):
        if shift in ("D", "M"):
            no_dm_ok = False
        a_count = sum(1 for n in non_trainee_names if result.schedule[n][d] == "A")
        c_count = sum(1 for n in non_trainee_names if result.schedule[n][d] == "C")
        b_total = sum(1 for row in result.schedule.values() if row[d] == "B")
        if shift == "A" and a_count < 1:
            pair_ok = False
        if shift == "C" and c_count < 1:
            pair_ok = False
        if shift == "B" and (a_count < 1 or c_count < 1):
            pair_ok = False
        if b_total > 1:
            b_cap_ok = False

    check(no_dm_ok, "見習生不會被排 D 或 M")
    check(pair_ok, "見習生每個上班日都有符合 H15 的同行人員")
    check(b_cap_ok, "B 班仍維持最多 1 人（含見習生）")

    # 求解結果送進驗證器，確認沒有 H15 或見習生個人休假規則違規。
    id_schedule = {
        emp.id: result.schedule[emp.name]
        for emp in data.employees
        if emp.name in result.schedule
    }
    violations = validator.validate(data, id_schedule)
    trainee_hard = [
        v
        for v in violations
        if v["employee_id"] == trainee.id
        and v["rule"] in ("H2", "H3", "H4", "H12", "H15")
    ]
    check(not [v for v in violations if v["rule"] == "H15"], "求解結果沒有 H15 違規")
    check(not trainee_hard, "見習生求解結果符合 H2/H3/H4/H12")

# --- 2. 驗證器：手動排出見習生單獨卡班要抓 H15 ---
num_days = data.num_days


def blank_schedule():
    return {emp.id: ["OFF"] * num_days for emp in data.employees}


def h15_messages(schedule):
    return [v for v in validator.validate(data, schedule) if v["rule"] == "H15"]


# A 班單獨見習生
s = blank_schedule()
s[trainee.id][0] = "A"
check(bool(h15_messages(s)), "驗證器抓到 A 班見習生單獨卡班")

# C 班單獨見習生
s = blank_schedule()
s[trainee.id][0] = "C"
check(bool(h15_messages(s)), "驗證器抓到 C 班見習生單獨卡班")

# B 班：只有 A 班一般人員，缺 C
s = blank_schedule()
s[trainee.id][0] = "B"
s[generals[0].id][0] = "A"
check(bool(h15_messages(s)), "驗證器抓到 B 班見習生缺 C 班同行")

# B 班：A、C 都有一般人員
s = blank_schedule()
s[trainee.id][0] = "B"
s[generals[0].id][0] = "A"
s[generals[1].id][0] = "C"
check(not h15_messages(s), "A、C 都有非見習時，B 班見習生可單獨上 B")

# A 班：見習生 + 一般人員
s = blank_schedule()
s[trainee.id][0] = "A"
s[generals[0].id][0] = "A"
check(not h15_messages(s), "A 班有非見習同行時不報 H15")

# --- 3. 格位驗證（validate_cell）---
# 先清空測試日，避免其他案例干擾。
for emp in [trainee, *generals]:
    for d in range(1, num_days + 1):
        schedule_service.upsert_cell(db, emp.id, Y, M, d, "OFF")

schedule_service.upsert_cell(db, generals[0].id, Y, M, 1, "A")
schedule_service.upsert_cell(db, generals[1].id, Y, M, 1, "C")

cell = schedule_service.validate_cell(db, trainee.id, Y, M, 1, "B")
check(
    not [v for v in cell["violations"] if v["rule"] == "H15"],
    "格位驗證：A/C 都有一般人員時，B 班見習生可排",
)

cell = schedule_service.validate_cell(db, trainee.id, Y, M, 1, "A")
check(
    not [v for v in cell["violations"] if v["rule"] == "H15"],
    "格位驗證：A 班有一般人員時，A 班見習生可排",
)

# 把 C 班一般人員拿掉，B 班見習生應被擋
schedule_service.upsert_cell(db, generals[1].id, Y, M, 1, "OFF")
cell = schedule_service.validate_cell(db, trainee.id, Y, M, 1, "B")
check(
    bool([v for v in cell["violations"] if v["rule"] == "H15"]),
    "格位驗證：B 班缺 C 班同行時會報 H15",
)

# A 班上限：兩個一般 + 一個見習 = 3 人
schedule_service.upsert_cell(db, generals[1].id, Y, M, 1, "A")
schedule_service.upsert_cell(db, generals[2].id, Y, M, 1, "A")
cell = schedule_service.validate_cell(db, trainee.id, Y, M, 1, "A")
check(
    bool([v for v in cell["violations"] if v["rule"] == "H1"]),
    "格位驗證：A 班超過 2 人會報 H1",
)

# B 班上限：一般 + 見習 = 2 人
schedule_service.upsert_cell(db, generals[0].id, Y, M, 1, "B")
cell = schedule_service.validate_cell(db, trainee.id, Y, M, 1, "B")
check(
    bool([v for v in cell["violations"] if v["rule"] == "H1"]),
    "格位驗證：B 班超過 1 人會報 H1",
)

# --- 4. API 寫入限制 ---
for shift in ("D", "M"):
    try:
        schedule_service.upsert_cell(db, trainee.id, Y, M, 2, shift)
        check(False, f"見習生寫入 {shift} 應被擋")
    except ValueError:
        check(True, f"見習生寫入 {shift} 被擋")

# --- 5. 診斷：缺少可帶人的非見習 A/C 人力 ---
diagnostic_data = copy.deepcopy(data)
for g in generals:
    diagnostic_data.special_leaves[g.id] = [1]
causes = diagnostics.diagnose_detailed(diagnostic_data)["likely_causes"]
check(
    any(c["type"] == "trainee_mentor_gap" for c in causes),
    "診斷回報見習同行人力不足",
)

# --- 6. 統計納入見習生 ---
stats = stats_service.get_month_stats(db, Y, M)
roles = {row["employee_name"]: row["role"] for row in stats["per_employee"]}
check(roles.get("見習甲") == "trainee", "月統計納入見習生並標示 role=trainee")

db.close()

print()
if fails:
    print(f"FAILED: {len(fails)}")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("ALL PASS")
