"""在職期間（hire_date 到職日 ～ resign_date 最後上班日）完整測試。

驗證：
1. 月份可見性：到職月之前不顯示、到職月起可見；離職月及之前可見、離職月之後不顯示。
2. 到職日／離職日防呆：resign_date < hire_date 拒絕；到職日前與離職日後拒絕排班／休假／請假，
   到職日當天與最後上班日當天允許。
3. 月中到職求解：data_loader 設 hire_start、求解時到職日前固定不排班、豁免 H2/H3/H4/H8/H9/H12、
   寫入 DB 時不為非在職日建立假 OFF 紀錄。
4. 統計排除：即使 DB 中殘留非在職日的班表（OFF/上班/請假），stats_service 與 off_day_service
   皆不計入上班、休假、請假、週末上班、連休與每日覆蓋。
5. S6 公平性計算排除月中到職／離職員工。
"""

import calendar
import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.api.routes.solve import SolveRequest, solve as solve_route
from app.database.connection import SessionLocal, init_db
from app.database.models import DesignatedOffDay, Employee, ScheduleEntry, SpecialLeave
from app.scheduler import data_loader, engine, validator
from app.schemas.employee import EmployeeCreate
from app.services import (
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


# ------------------------------------------------------------ 1. 建檔與日期防呆
try:
    employee_service.create_employee(
        db,
        EmployeeCreate(
            name="無效日期",
            role="general",
            hire_date="2026-06-20",
            resign_date="2026-06-10",
        ),
    )
    check(False, "1a. 離職日早於到職日應被拒")
except ValueError:
    check(True, "1a. 離職日早於到職日被拒")

Y, M = 2026, 8
num_days = calendar.monthrange(Y, M)[1]

e1 = Employee(name="小一", role="general", available_shifts='["A","B","C"]', preferred_shift="A", scheduling_mode="auto")
e2 = Employee(name="小二", role="general", available_shifts='["A","B","C"]', preferred_shift="C", scheduling_mode="auto")
e3 = Employee(name="小三", role="general", available_shifts='["A","B","C"]', preferred_shift="B", scheduling_mode="auto")
e4 = Employee(name="小四", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
# 月中到職（8/15 到職）
newbie = Employee(
    name="新人甲",
    role="general",
    available_shifts='["A","B","C"]',
    preferred_shift=None,
    scheduling_mode="auto",
    hire_date="2026-08-15",
)
# 月中離職（8/10 最後上班日）
leaver = Employee(
    name="離職乙",
    role="general",
    available_shifts='["A","B","C"]',
    preferred_shift=None,
    scheduling_mode="auto",
    hire_date="2026-01-01",
    resign_date="2026-08-10",
)
# 同時月中到職＋月中離職（8/5 ~ 8/20）
short_term = Employee(
    name="短期丙",
    role="general",
    available_shifts='["A","B","C"]',
    preferred_shift=None,
    scheduling_mode="manual",
    hire_date="2026-08-05",
    resign_date="2026-08-20",
)
db.add_all([e1, e2, e3, e4, newbie, leaver, short_term])
db.commit()

# ------------------------------------------------------------ 2. 可見性檢查
check(not employee_service.is_visible_in_month(newbie, 2026, 7), "2a. 到職月之前不可見")
check(employee_service.is_visible_in_month(newbie, 2026, 8), "2b. 到職月可見")
check(employee_service.is_visible_in_month(newbie, 2026, 9), "2c. 到職月之後可見")

view_july = schedule_service.get_month_view(db, 2026, 7, 31)
check("新人甲" not in view_july["schedule"], "2d. 7 月班表不含 8 月才到職的新人甲")
check("離職乙" in view_july["schedule"], "2e. 7 月班表仍含 8 月離職的離職乙")

view_aug = schedule_service.get_month_view(db, Y, M, num_days)
check("新人甲" in view_aug["schedule"], "2f. 8 月班表含新人甲")
check("離職乙" in view_aug["schedule"], "2g. 8 月班表含離職乙")

view_sep = schedule_service.get_month_view(db, 2026, 9, 30)
check("新人甲" in view_sep["schedule"], "2h. 9 月班表含新人甲")
check("離職乙" not in view_sep["schedule"], "2i. 9 月班表不含離職乙")

# ------------------------------------------------------------ 3. 邊界日檢查
check(not employee_service.is_schedulable_on(newbie, Y, M, 14), "3a. 到職日前一天不可排")
check(employee_service.is_schedulable_on(newbie, Y, M, 15), "3b. 到職日當天可排")
check(employee_service.is_schedulable_on(leaver, Y, M, 10), "3c. 最後上班日當天可排")
check(not employee_service.is_schedulable_on(leaver, Y, M, 11), "3d. 最後上班日隔天不可排")

try:
    schedule_service.upsert_cell(db, newbie.id, Y, M, 14, "A")
    check(False, "3e. 到職日前手動排班應被拒")
except ValueError as err:
    check("尚未到職" in str(err), f"3e. 到職日前手動排班被拒（{err}）")

try:
    schedule_service.upsert_cell(db, leaver.id, Y, M, 11, "A")
    check(False, "3f. 離職日後手動排班應被拒")
except ValueError as err:
    check("已離職" in str(err), f"3f. 離職日後手動排班被拒（{err}）")

try:
    off_day_service.add_designated_off(db, newbie.id, Y, M, 10)
    check(False, "3g. 到職日前指定休假應被拒")
except ValueError:
    check(True, "3g. 到職日前指定休假被拒")

try:
    off_day_service.add_special_leave(db, leaver.id, Y, M, 12, "SPECIAL")
    check(False, "3h. 離職日後請假應被拒")
except ValueError:
    check(True, "3h. 離職日後請假被拒")

# 邊界當天可排班
schedule_service.upsert_cell(db, short_term.id, Y, M, 5, "A")
schedule_service.upsert_cell(db, short_term.id, Y, M, 20, "C")
check(True, "3i. 到職日與最後上班日當天手動排班成功")

# ------------------------------------------------------------ 4. 求解器與 data_loader
data = data_loader.load(db, Y, M)
check(data.hire_start.get(newbie.id) == 15, f"4a. data.hire_start[newbie] = {data.hire_start.get(newbie.id)}")
check(data.resign_cutoff.get(leaver.id) == 10, f"4b. data.resign_cutoff[leaver] = {data.resign_cutoff.get(leaver.id)}")
check(data.hire_start.get(short_term.id) == 5 and data.resign_cutoff.get(short_term.id) == 20,
      "4c. 短期丙同時有 hire_start=5 與 resign_cutoff=20")

res = solve_route(SolveRequest(year=Y, month=M, max_solve_time=30.0), db)
check(res.success, f"4d. 8 月求解成功（error={res.error}）")

# 檢查 DB 寫入：非在職日不寫入 ScheduleEntry（保留 EMPTY）
view_after = schedule_service.get_month_view(db, Y, M, num_days)
newbie_before = view_after["schedule"]["新人甲"][:14]
leaver_after = view_after["schedule"]["離職乙"][10:]
check(all(s == "EMPTY" for s in newbie_before), f"4e. 新人甲 8/1~8/14 不寫入假 OFF（實際 {set(newbie_before)}）")
check(all(s == "EMPTY" for s in leaver_after), f"4f. 離職乙 8/11~8/31 不寫入假 OFF（實際 {set(leaver_after)}）")

# 驗證報告對月中到職／離職員工不報 H2/H3/H4/H8/H9/H12
report = schedule_service.get_validation_report(db, Y, M)
partial_viols = [
    v for v in report["violations"]
    if v["employee_id"] in (newbie.id, leaver.id)
    and v["rule"] in ("H2", "H3", "H4", "H8", "H9", "H12")
]
check(len(partial_viols) == 0, f"4g. 驗證報告對月中到職/離職不報週休/連休違規（實際 {partial_viols}）")

# ------------------------------------------------------------ 5. 統計排除（含殘留髒資料）
# 刻意直接塞入 DB 殘留資料：新人甲 8/1~8/4 排 A/OFF/OFF/SPECIAL，離職乙 8/12~8/15 排 A/OFF/OFF/SPECIAL
db.add_all([
    ScheduleEntry(employee_id=newbie.id, year=Y, month=M, day=1, shift="A", source="auto"),
    ScheduleEntry(employee_id=newbie.id, year=Y, month=M, day=2, shift="OFF", source="auto"),
    ScheduleEntry(employee_id=newbie.id, year=Y, month=M, day=3, shift="OFF", source="auto"),
    ScheduleEntry(employee_id=newbie.id, year=Y, month=M, day=4, shift="SPECIAL", source="special"),
    SpecialLeave(employee_id=newbie.id, year=Y, month=M, day=4, leave_type="PERSONAL"),
    DesignatedOffDay(employee_id=newbie.id, year=Y, month=M, day=2),
    ScheduleEntry(employee_id=leaver.id, year=Y, month=M, day=12, shift="C", source="auto"),
    ScheduleEntry(employee_id=leaver.id, year=Y, month=M, day=13, shift="OFF", source="auto"),
    ScheduleEntry(employee_id=leaver.id, year=Y, month=M, day=14, shift="OFF", source="auto"),
    ScheduleEntry(employee_id=leaver.id, year=Y, month=M, day=15, shift="SPECIAL", source="special"),
    SpecialLeave(employee_id=leaver.id, year=Y, month=M, day=15, leave_type="SICK"),
])
# 短期丙在職期間（8/5~8/20）外也塞假資料，在職期間設 8/5=A, 8/20=C, 8/10=OFF, 8/11=OFF
db.add_all([
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=1, shift="A", source="manual"),
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=2, shift="OFF", source="manual"),
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=3, shift="OFF", source="manual"),
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=10, shift="OFF", source="manual"),
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=11, shift="OFF", source="manual"),
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=25, shift="A", source="manual"),
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=26, shift="OFF", source="manual"),
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=27, shift="OFF", source="manual"),
    ScheduleEntry(employee_id=short_term.id, year=Y, month=M, day=28, shift="SPECIAL", source="manual"),
    SpecialLeave(employee_id=short_term.id, year=Y, month=M, day=28, leave_type="SICK"),
])
db.commit()

stats = stats_service.get_month_stats(db, Y, M)
by_name = {row["employee_name"]: row for row in stats["per_employee"]}

st = by_name["短期丙"]
check(st["total_work_days"] == 2, f"5a. 短期丙只計在職日上班 2 天（8/5, 8/20），實得 {st['total_work_days']}")
check(st["total_off_days"] == 2, f"5b. 短期丙只計在職日休假 2 天（8/10, 8/11），實得 {st['total_off_days']}")
check(st["total_special_days"] == 0, f"5c. 短期丙不計離職後請假，實得 {st['total_special_days']}")
check(st["total_leave_days"] == 0, f"5d. 短期丙 leave_type_counts 不計離職後請假，實得 {st['total_leave_days']}")
check(st["consecutive_off_count"] == 1, f"5e. 短期丙連休只計在職日 1 次（8/10-11），實得 {st['consecutive_off_count']}")

nb = by_name["新人甲"]
check(nb["leave_type_counts"].get("PERSONAL", 0) == 0, "5f. 新人甲到職前事假不計入統計")
lv = by_name["離職乙"]
check(lv["leave_type_counts"].get("SICK", 0) == 0, "5g. 離職乙離職後病假不計入統計")

# off_day_service 摘要也排除非在職日
off_sum = off_day_service.get_off_day_summary(db, Y, M)
check(off_sum[str(newbie.id)]["designated_count"] == 0, "5h. 休假摘要排除到職前指定休假")
check(off_sum[str(newbie.id)]["total_leave_days"] == 0, "5i. 休假摘要排除到職前請假")
check(off_sum[str(short_term.id)]["consecutive_off_count"] == 1, "5j. 休假摘要連休只算在職期間")

# 確認 S6 公平性排除月中到職/離職
data_for_s6 = data_loader.load(db, Y, M)
s6_sched = {
    e.id: ["A"] * 20 + ["OFF"] * (num_days - 20)
    for e in data_for_s6.employees
}
# 讓新人甲只有 5 天班（模擬月中到職），不應拉大 S6 spread
s6_sched[newbie.id] = ["OFF"] * 26 + ["A"] * 5
spread = validator.compute_fairness_spread(data_for_s6, s6_sched)
check(spread == 0, f"5k. S6 公平性差值排除月中到職/離職（實得 {spread}）")

print("=" * 70)
if fails:
    print(f"FAILED: {len(fails)} 項 -> {fails}")
    sys.exit(1)
print("EMPLOYMENT WINDOW ALL CHECKS PASSED")
sys.exit(0)
