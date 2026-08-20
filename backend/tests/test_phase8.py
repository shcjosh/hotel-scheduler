import os
import sys
import tempfile
from datetime import date

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import Employee, ScheduleEntry
from app.scheduler import data_loader, engine

init_db()
db = SessionLocal()

wang = Employee(name="王先生", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
lee = Employee(name="李小姐", role="general", available_shifts='["A","B","C"]', preferred_shift="A", scheduling_mode="auto")
chang = Employee(name="張先生", role="general", available_shifts='["A","B","C"]', preferred_shift="C", scheduling_mode="auto")
lin = Employee(name="林備援", role="cd_backup", available_shifts='["C","D"]', preferred_shift="C", scheduling_mode="auto")
chen = Employee(name="陳大夜", role="night", available_shifts='["D"]', preferred_shift="D", scheduling_mode="manual")
mgr = Employee(name="王管理", role="manager", available_shifts='["M","A","B","C","D"]', preferred_shift="M", scheduling_mode="auto")
db.add_all([wang, lee, chang, lin, chen, mgr])
db.commit()

night = {1:"D",2:"OFF",3:"OFF",4:"OFF",5:"D",6:"D",7:"D",8:"D",9:"D",10:"OFF",
         11:"D",12:"D",13:"D",14:"OFF",15:"D",16:"D",17:"OFF",18:"OFF",19:"D",
         20:"D",21:"D",22:"D",23:"D",24:"OFF",25:"D",26:"D",27:"D",28:"OFF",
         29:"D",30:"D",31:"D"}
for day, sh in night.items():
    db.add(ScheduleEntry(employee_id=chen.id, year=2026, month=8, day=day, shift=sh, source="night_input"))
db.commit()

year, month = 2026, 8
data = data_loader.load(db, year, month)
result = engine.solve(data)
assert result.success, "初始求解應成功"
current = result.schedule

data.special_leaves.setdefault(lee.id, []).extend([21, 22, 23])
data.special_leaves[lee.id] = sorted(set(data.special_leaves[lee.id]))

adj = engine.solve_adjust(data, current, lee.id, date(year, month, 20))
assert adj.success, f"調整求解應成功：{adj.error}"
new = adj.schedule

# 請假日 8/21-8/23 應為 SPECIAL
assert new[lee.name][20] == "SPECIAL", "8/21 應為 SPECIAL"
assert new[lee.name][21] == "SPECIAL", "8/22 應為 SPECIAL"
assert new[lee.name][22] == "SPECIAL", "8/23 應為 SPECIAL"
print("[PASS] 請假日變為 SPECIAL")

# 凍結日（8/1-8/19）不變
for d in range(19):
    assert new[lee.name][d] == current[lee.name][d], f"凍結日 {d+1} 不應變動"
print("[PASS] 過去日期凍結不變")

# 其他人（非請假者）應盡量少動：至少 8/20 之前的格子不變
for name in current:
    for d in range(19):
        assert new[name][d] == current[name][d], f"{name} 凍結日 {d+1} 不應變動"
print("[PASS] 全員過去日期凍結不變")

db.close()
print("=" * 70)
print("MODULE 8 (ADJUST SOLVE) ALL CHECKS PASSED")
