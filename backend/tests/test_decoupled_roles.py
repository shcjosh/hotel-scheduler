"""v1.4.0-beta 測試：身分與班別/模式脫鉤、手動模式豁免與覆蓋、D 班備援新順位、全班別手動編輯與 H7 警告。"""

import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select

from app.api.routes.solve import solve as solve_route
from app.database.connection import SessionLocal, init_db
from app.database.models import DBackupRequest, DesignatedOffDay, Employee, ScheduleEntry
from app.scheduler import data_loader, engine, validator
from app.schemas.employee import EmployeeCreate
from app.schemas.solve import SolveRequest
from app.services import employee_service, night_service, schedule_service

init_db()
db = SessionLocal()

fails: list[str] = []


def check(cond: bool, msg: str):
    if cond:
        print(f"  [PASS] {msg}")
    else:
        print(f"  [FAIL] {msg}")
        fails.append(msg)


Y, M = 2026, 7

# --- 1. 身分與班別／模式脫鉤 ---
g_d = employee_service.create_employee(
    db,
    EmployeeCreate(
        name="一般可D",
        role="general",
        available_shifts=["A", "B", "C", "D"],
        preferred_shift="C",
        scheduling_mode="auto",
    ),
)
g1 = employee_service.create_employee(
    db,
    EmployeeCreate(name="一般甲", role="general", available_shifts=["A", "B", "C"], scheduling_mode="auto"),
)
g2 = employee_service.create_employee(
    db,
    EmployeeCreate(name="一般乙", role="general", available_shifts=["A", "B", "C"], scheduling_mode="auto"),
)
mgr = employee_service.create_employee(
    db,
    EmployeeCreate(
        name="店長",
        role="manager",
        available_shifts=["M", "A", "B", "C", "D"],
        preferred_shift="M",
        scheduling_mode="auto",
    ),
)
trainee = employee_service.create_employee(
    db,
    EmployeeCreate(
        name="見習生",
        role="trainee",
        available_shifts=["A", "B", "C", "D", "M"],
        scheduling_mode="auto",
    ),
)
pt = employee_service.create_employee(
    db,
    EmployeeCreate(
        name="PT手動",
        role="general",
        available_shifts=["A", "C"],
        scheduling_mode="manual",
    ),
)
night = employee_service.create_employee(
    db,
    EmployeeCreate(name="陳大夜", role="night"),
)
support = employee_service.create_employee(
    db,
    EmployeeCreate(name="二館支援", role="general", tag="二館"),
)

check(g_d.scheduling_mode == "auto" and '"D"' in g_d.available_shifts, "一般櫃台可勾選 D 班")
check(pt.scheduling_mode == "manual", "一般櫃台可切換為手動模式")
check('"D"' in trainee.available_shifts and '"M"' in trainee.available_shifts, "見習生可自由勾選 D/M")

try:
    employee_service.create_employee(
        db, EmployeeCreate(name="房務錯", role="housekeeping", available_shifts=["A", "B"])
    )
    check(False, "房務仍限制僅 A 班")
except ValueError:
    check(True, "房務仍限制僅 A 班")

# --- 2. 大夜規則預設關閉 ---
ov = night_service.get_rule_overrides(db)
check(ov[str(night.id)]["ignore_all"] is True, "大夜規則預設 ignore_all=True")
check(
    not any(ov[str(night.id)][r] for r in ("H2", "H3", "H4", "H12")),
    "大夜規則預設 H2/H3/H4/H12 全關閉",
)
for d in range(1, 32):
    schedule_service.upsert_cell(db, night.id, Y, M, d, "D")
nv = night_service.validate_night_schedule(db, Y, M)
check(nv["all_ignored"] is True and nv["violations"] == [], "大夜驗證預設全略過")

# 測試明確開啟 ignore_all=False + H12=True 會被記住
night_service.update_rule_overrides(db, night.id, {"ignore_all": False})
night_service.update_rule_overrides(db, night.id, {"H12": True})
nv_on = night_service.validate_night_schedule(db, Y, M)
check(
    nv_on["all_ignored"] is False and any(v["rule"] == "H12" for v in nv_on["violations"]),
    "大夜規則明確開啟後可檢驗 H12",
)
# 復原回預設關閉
night_service.update_rule_overrides(db, night.id, {"ignore_all": True})

# --- 3. 手動模式（PT）固定班表 + 豁免個人規則 + 計入 H1 覆蓋與 H15 同行 ---
# 讓 PT 故意連上 7 天（7/1~7/7 A 班），測試不造成無解且完全豁免個人規則
for d in range(1, 8):
    schedule_service.upsert_cell(db, pt.id, Y, M, d, "A")

# 大夜在 7/10 休假、7/11 休假，設為 D 班備援日
schedule_service.upsert_cell(db, night.id, Y, M, 10, "OFF")
schedule_service.upsert_cell(db, night.id, Y, M, 11, "OFF")
db.add(DBackupRequest(year=Y, month=M, day=10))
db.add(DBackupRequest(year=Y, month=M, day=11))
# 7/11 讓非管理職可 D 的「一般可D」指定休假 → 應落到第二順位「店長」
db.add(DesignatedOffDay(employee_id=g_d.id, year=Y, month=M, day=11))
db.commit()

# 先驗證 D 班備援指派順位：7/10 應給非管理職（一般可D），7/11 應給管理職（店長），見習生不納入 D 備援
data_pre = data_loader.load(db, Y, M)
check(data_pre.d_backup_assignments.get(10) == g_d.id, "D 備援第一順位：非管理職勾選 D 的自動員工")
check(data_pre.d_backup_assignments.get(11) == mgr.id, "D 備援第二順位：非管理職休假時由管理職接手")

# 執行自動排班路由（應保留 PT 與大夜格位，只覆寫自動員工）
res = solve_route(SolveRequest(year=Y, month=M, max_solve_time=30.0), db=db)
check(res.success is True, f"含手動 PT 與 D 備援之自動排班求解成功（error={res.error}）")

if res.success and res.schedule:
    # 確認非備援日所有自動員工都不會被排 D
    auto_names = [g_d.name, g1.name, g2.name, mgr.name, trainee.name]
    bad_d = []
    for name in auto_names:
        for d_idx, shift in enumerate(res.schedule[name]):
            day = d_idx + 1
            if shift == "D":
                expected_name = g_d.name if day == 10 else (mgr.name if day == 11 else None)
                if name != expected_name:
                    bad_d.append((name, day))
    check(bad_d == [], f"非備援日自動員工一律不排 D（異常={bad_d}）")
    check(res.schedule[g_d.name][9] == "D", "7/10 一般可D 排 D")
    check(res.schedule[mgr.name][10] == "D", "7/11 店長 排 D")

    # 確認 PT 在 DB 中：7/1~7/7 保留為 A，7/8~7/31 保持空白（不被 solve 寫入 OFF）
    pt_entries = {
        e.day: e.shift
        for e in db.scalars(
            select(ScheduleEntry).where(
                ScheduleEntry.employee_id == pt.id,
                ScheduleEntry.year == Y,
                ScheduleEntry.month == M,
            )
        )
    }
    check(
        all(pt_entries.get(d) == "A" for d in range(1, 8)) and len(pt_entries) == 7,
        f"自動排班保留 PT 已排的 7 天 A 班且不把空白日填滿（實際 {len(pt_entries)} 筆）",
    )

    # 確認 H1 上限把 PT 計入：7/1~7/7 每天全部本館人員（含 PT）A 班 <= 2
    day_a_ok = True
    for d_idx in range(7):
        total_a = sum(1 for row in res.schedule.values() if row[d_idx] == "A")
        if total_a > 2:
            day_a_ok = False
    check(day_a_ok, "PT 已排 A 班計入當日 H1 上限（A <= 2）")

    # 確認驗證報告不報 PT 任何硬性違規或軟性警告（即使 PT 連上 7 天且無連休）
    report = schedule_service.get_validation_report(db, Y, M)
    pt_viols = [v for v in report["violations"] if v["employee_id"] == pt.id]
    pt_warns = [w for w in report["warnings"] if w["employee_id"] == pt.id]
    check(pt_viols == [] and pt_warns == [], "驗證報告完全豁免手動 PT 之個人規則")
    check(report["summary"]["hard_violations"] == 0, f"整月驗證 0 硬性違規（實際 {report['violations']}）")

    # 確認手動 PT 的 validate_cell 回傳空
    vc_pt = schedule_service.validate_cell(db, pt.id, Y, M, 8, "A")
    check(vc_pt["violations"] == [] and vc_pt["warnings"] == [], "手動 PT 格位即時檢查豁免所有規則")

# --- 4. 手動 PT 上 A 班可當見習生 H15 同行 ---
# 把 7/1 其他非見習自動人員都改成 OFF，只留 PT=A、見習生=A
for emp in (g_d, g1, g2, mgr):
    schedule_service.upsert_cell(db, emp.id, Y, M, 1, "OFF")
vc_tr = schedule_service.validate_cell(db, trainee.id, Y, M, 1, "A")
check(
    not any(v["rule"] == "H15" for v in vc_tr["violations"]),
    "本館手動 PT 上 A 班可作為見習生 H15 同行人員",
)

# --- 5. 全班別手動編輯與 H7 軟性警告 + 二館支援維持獨立 ---
# 一般甲（未勾 D/M）可手動排 D 與 M，validate_cell 只報 H7 警告不報硬性違規
for s in ("D", "M"):
    schedule_service.upsert_cell(db, g1.id, Y, M, 15, s)
    vc = schedule_service.validate_cell(db, g1.id, Y, M, 15, s)
    check(
        not any(v["rule"] == "H7" for v in vc["violations"])
        and any(w["rule"] == "H7" for w in vc["warnings"]),
        f"一般甲可手動排 {s}，H7 顯示為軟性警告（可略過）",
    )

# 二館支援仍限 A1/C1/D1；本館不可排 A1
schedule_service.upsert_cell(db, support.id, Y, M, 20, "A1")
try:
    schedule_service.upsert_cell(db, support.id, Y, M, 20, "A")
    check(False, "二館支援不可排 A")
except ValueError:
    check(True, "二館支援不可排 A")
try:
    schedule_service.upsert_cell(db, g1.id, Y, M, 20, "A1")
    check(False, "本館員工不可排 A1")
except ValueError:
    check(True, "本館員工不可排 A1")

# --- 6. 清空班表：清除自動 + 手動 PT + 二館支援，唯獨保留大夜專職 ---
schedule_service.clear_month_schedule(db, Y, M, group="front")
rem_pt = list(db.scalars(select(ScheduleEntry).where(ScheduleEntry.employee_id == pt.id, ScheduleEntry.year == Y, ScheduleEntry.month == M)))
rem_g1 = list(db.scalars(select(ScheduleEntry).where(ScheduleEntry.employee_id == g1.id, ScheduleEntry.year == Y, ScheduleEntry.month == M)))
rem_sup = list(db.scalars(select(ScheduleEntry).where(ScheduleEntry.employee_id == support.id, ScheduleEntry.year == Y, ScheduleEntry.month == M)))
rem_night = list(db.scalars(select(ScheduleEntry).where(ScheduleEntry.employee_id == night.id, ScheduleEntry.year == Y, ScheduleEntry.month == M)))
check(len(rem_pt) == 0, "清空班表一併清空手動 PT 格位")
check(len(rem_g1) == 0, "清空班表清空自動員工格位")
check(len(rem_sup) == 0, "清空班表清空二館支援格位")
check(len(rem_night) == 31, f"清空班表唯獨保留大夜專職（實際 {len(rem_night)} 筆）")

db.close()

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)}")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("DECOUPLED ROLES & MANUAL MODE (v1.4.0-beta) ALL CHECKS PASSED")
