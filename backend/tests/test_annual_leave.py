"""特休（週年制）紀錄與編號測試。

- 期間切法（首段到職 +6 個月～+1 年）
- 勞基法額度階梯（含滿 10 年 +1、上限 30）
- 特 N 編號：起算 = floor(期初已用)，半天不影響編號
- 期初已用 / 額度覆寫 / 半天紀錄
- 月中換檔（同一日曆月出現兩個週年期間）
"""

import os
import sys
import tempfile
from datetime import date

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import Employee
from app.services import annual_leave_service as al
from app.services import schedule_service

init_db()
db = SessionLocal()

fails = []


def check(cond, label):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        fails.append(label)


def mk(name, hire_date, **kw):
    e = Employee(
        name=name,
        role="general",
        available_shifts='["A","B","C"]',
        preferred_shift=None,
        scheduling_mode="auto",
        hire_date=hire_date,
        **kw,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def add_leave(emp, y, m, d, ltype="SPECIAL"):
    from app.services.off_day_service import add_special_leave

    return add_special_leave(db, emp.id, y, m, d, ltype)


# ---------------------------------------------------------------- 1. 期間切法
JOSH = date(2024, 2, 15)
check(al.period_start_for(JOSH, date(2024, 8, 14)) is None, "1a. 未滿 6 個月 → 無期間")
check(al.period_start_for(JOSH, date(2024, 8, 15)) == date(2024, 8, 15), "1b. 滿 6 個月起算")
check(al.period_start_for(JOSH, date(2025, 2, 14)) == date(2024, 8, 15), "1c. 滿 1 年前一天仍屬首段")
check(al.period_start_for(JOSH, date(2025, 2, 15)) == date(2025, 2, 15), "1d. 滿 1 年換檔")
check(al.period_start_for(JOSH, date(2027, 2, 15)) == date(2027, 2, 15), "1e. 滿 3 年換檔")

# ---------------------------------------------------------------- 2. 額度階梯
check(al.entitlement_years(0) == 3, "2a. 滿 6 個月 = 3")
check(al.entitlement_years(1) == 7, "2b. 滿 1 年 = 7")
check(al.entitlement_years(2) == 10, "2c. 滿 2 年 = 10")
check(al.entitlement_years(3) == 14, "2d. 滿 3 年 = 14")
check(al.entitlement_years(4) == 14, "2e. 滿 4 年 = 14")
check(al.entitlement_years(9) == 15, "2f. 滿 9 年 = 15")
check(al.entitlement_years(10) == 16, "2g. 滿 10 年 = 16")
check(al.entitlement_years(24) == 30, "2h. 滿 24 年 = 30")
check(al.entitlement_years(30) == 30, "2i. 上限 30")
check(al.entitlement_for_period(JOSH, date(2027, 2, 15)) == 14, "2j. Josh 滿 3 年期間 = 14")

# ---------------------------------------------------------------- 3. 月中換檔
check(
    al.periods_overlapping_month(JOSH, 2027, 2) == [date(2026, 2, 15), date(2027, 2, 15)],
    "3a. 2 月有兩個週年期間",
)
check(
    al.periods_overlapping_month(JOSH, 2027, 3) == [date(2027, 2, 15)],
    "3b. 3 月只有一個期間",
)
check(al.periods_overlapping_month(JOSH, 2024, 7) == [], "3c. 到職未滿半年無期間")

# ---------------------------------------------------------------- 4. 特 N 編號
josh = mk("Josh", "2024-02-15")
# 2027-03 全屬 2027-02-15 期間；期初已用 3 天
al.upsert_adjustment(db, josh.id, "2027-02-15", 3, None, None)
add_leave(josh, 2027, 2, 20)  # 期間內、3 月之前 → 影響 base
add_leave(josh, 2027, 3, 2)
add_leave(josh, 2027, 3, 5)
add_leave(josh, 2027, 3, 10)
add_leave(josh, 2027, 3, 7, "PERSONAL")  # 非特休，不計入編號

info = al.month_leave_info(db, [josh], 2027, 3, 31)
seq = info["Josh"]["sequence"]
check(seq == {2: 5, 5: 6, 10: 7}, f"4a. 3 月特 N 編號（含期初 3 + 2 月 1 筆）= {seq}")
check(info["Josh"]["base"] == [{"period_start": "2027-02-15", "period_end": "2028-02-14", "base": 4}],
      "4b. base = floor(期初 3) + 期間內先前 1 筆 = 4")

# ---------------------------------------------------------------- 5. 月中換檔編號
josh2 = mk("Josh2", "2024-02-15")
al.upsert_adjustment(db, josh2.id, "2027-02-15", 3, None, None)
add_leave(josh2, 2026, 12, 25)  # 屬 2026-02-15 期間（2 月 1-14 日）
add_leave(josh2, 2027, 2, 5)
add_leave(josh2, 2027, 2, 18)
add_leave(josh2, 2027, 2, 20)
info2 = al.month_leave_info(db, [josh2], 2027, 2, 28)
seq2 = info2["Josh2"]["sequence"]
check(seq2.get(5) == 2, f"5a. 2/5 屬舊期間，先前有 12/25 → 特2（實得 {seq2.get(5)}）")
check(seq2.get(18) == 4, f"5b. 2/18 屬新期間，期初 3 → 特4（實得 {seq2.get(18)}）")
check(info2["Josh2"]["base"][1]["base"] == 3, "5c. 新期間 base = 3")
check(seq2.get(20) == 5, "5d. 2/20 續編特5")

# ---------------------------------------------------------------- 6. 半天不影響編號
al.add_manual_entry(db, josh.id, "2027-03-15", 0.5, "臨時半天")
info3 = al.month_leave_info(db, [josh], 2027, 3, 31)
check(info3["Josh"]["sequence"] == {2: 5, 5: 6, 10: 7}, "6a. 半天紀錄不改變特 N 編號")
summary = al.employee_periods(db, josh, 2027, 3)
p = summary["periods"][0]
# 期間 2027-02-15 內：system 4 筆（2/20,3/2,3/5,3/10）+ 期初 3 + 半天 0.5 = 7.5
check(p["system_days"] == 4, f"6b. 期間內整天特休 4 筆（實得 {p['system_days']}）")
check(abs(p["used_days"] - 7.5) < 1e-9, f"6c. 已用 = 7.5（實得 {p['used_days']}）")
check(abs(p["remaining"] - 6.5) < 1e-9, f"6d. 剩餘 = 6.5（實得 {p['remaining']}）")
check(p["entitlement"] == 14, "6e. 額度 = 14")

# ---------------------------------------------------------------- 7. 額度覆寫
al.upsert_adjustment(db, josh.id, "2027-02-15", 3, 20, "合約優於勞基法")
summary2 = al.employee_periods(db, josh, 2027, 3)
check(summary2["periods"][0]["entitlement"] == 20, "7a. 覆寫額度 = 20")
check(summary2["periods"][0]["entitlement_override"] == 20, "7b. 回傳覆寫值")
# 還原
al.upsert_adjustment(db, josh.id, "2027-02-15", 3, None, None)

# ---------------------------------------------------------------- 8. 期間驗證
try:
    al.upsert_adjustment(db, josh.id, "2027-03-01", 0, None, None)
    check(False, "8a. 非期間起始日應被拒")
except ValueError:
    check(True, "8a. 非期間起始日被拒")

try:
    al.add_manual_entry(db, josh.id, "2027-03-20", 0, None)
    check(False, "8b. 天數 0 應被拒")
except ValueError:
    check(True, "8b. 天數 0 被拒")

try:
    al.upsert_adjustment(db, josh.id, "2027-02-15", -1, None, None)
    check(False, "8c. 負數期初應被拒")
except ValueError:
    check(True, "8c. 負數期初被拒")

# ---------------------------------------------------------------- 9. 未設定到職日 / 未滿半年
nohire = mk("無到職日", None)
check(al.employee_periods(db, nohire, 2027, 3) is None, "9a. 未設定到職日 → 無特休資訊")
check("無到職日" not in al.month_leave_info(db, [nohire], 2027, 3, 31), "9b. 未設定到職日 → 無編號")
newbie = mk("新人", "2026-01-10")
check(al.employee_periods(db, newbie, 2026, 3) is None, "9c. 到職未滿 6 個月 → 無期間")

# ---------------------------------------------------------------- 10. 排班表整合
view = schedule_service.get_month_view(db, 2027, 3, 31)
check(view["leave_sequence"].get("Josh") == {2: 5, 5: 6, 10: 7}, "10a. get_month_view 含 leave_sequence")
check(view["leave_base"].get("Josh", [{}])[0].get("base") == 4, "10b. get_month_view 含 leave_base")

# ---------------------------------------------------------------- 11. 手動紀錄刪除
entries = al.get_month_summary(db, 2027, 3)["employees"][str(josh.id)]["manual_entries"]
check(len(entries) == 1 and entries[0]["days"] == 0.5, "11a. 摘要含半天紀錄")
al.delete_manual_entry(db, entries[0]["id"])
check(
    al.get_month_summary(db, 2027, 3)["employees"][str(josh.id)]["manual_entries"] == [],
    "11b. 半天紀錄刪除後為空",
)

print("=" * 60)
if fails:
    print(f"{len(fails)} FAILED:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("ANNUAL LEAVE ALL CHECKS PASSED")
