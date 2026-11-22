import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import SessionLocal, init_db
from app.database.models import DBackupRequest, DesignatedOffDay, Employee
from app.scheduler import data_loader, engine

init_db()
db = SessionLocal()

mgr = Employee(name="王管理", role="manager", available_shifts='["M","A","B","C","D"]', preferred_shift="M", scheduling_mode="auto")
g1 = Employee(name="李一般", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
g2 = Employee(name="陳一般", role="general", available_shifts='["A","B","C"]', preferred_shift=None, scheduling_mode="auto")
db.add_all([mgr, g1, g2])
db.commit()

year, month = 2026, 9

# 案例 1：無 CD 備援 → 管理職補 D
db.add(DBackupRequest(year=year, month=month, day=10))
db.commit()
data = data_loader.load(db, year, month)
assert data.d_backup_assignments.get(10) == mgr.id, "無 CD 備援時應由管理職補 D"
assert 10 not in data.d_backup_unfillable
print("[PASS] 無 CD 備援 → 管理職補 D")

# 案例 2：無 CD 備援 + 管理職當日指定休假 → 無法指派，求解失敗並說明原因
db.add(DesignatedOffDay(employee_id=mgr.id, year=year, month=month, day=11))
db.add(DBackupRequest(year=year, month=month, day=11))
db.commit()
data = data_loader.load(db, year, month)
assert 11 in data.d_backup_unfillable, "管理職當日請假且無 CD 備援 → 應無法指派"
result = engine.solve(data)
assert result.success is False
assert result.status == "INFEASIBLE", f"備援無法指派應為 INFEASIBLE，實際 {result.status}"
causes = result.diagnostics["likely_causes"]
assert any(c["type"] == "d_backup_unfillable" and c.get("day") == 11 for c in causes), "診斷應含 d_backup_unfillable(day=11)"
print("[PASS] 無 CD 備援 + 管理職請假 → 求解失敗並說明原因")

# 案例 3（v1.4.0）：管理職（有勾 D）頂 D 備援日 16、17 號，非備援日不主動排 D，
# 且唯一可上 C 的員工在 16、17 號固定休 → solve 路由自動請求 16/17 C 班二館支援並繼續求解成功
from app.api.routes.solve import solve as solve_route
from app.schemas.solve import SolveRequest
from app.scheduler import validator

year2, month2 = 2026, 12
mgr.available_shifts = '["A","C","M","D"]'
g1.available_shifts = '["A","C"]'
g2.available_shifts = '["A"]'
db.commit()

db.add(DBackupRequest(year=year2, month=month2, day=16))
db.add(DBackupRequest(year=year2, month=month2, day=17))
db.add(DesignatedOffDay(employee_id=g1.id, year=year2, month=month2, day=16))
db.add(DesignatedOffDay(employee_id=g1.id, year=year2, month=month2, day=17))
db.commit()

res = solve_route(SolveRequest(year=year2, month=month2, max_solve_time=30.0), db=db)
assert res.success is True, f"應自動請求二館支援並求解成功，實際 error={res.error}"
req_set = {(r["day"], r["shift"]) for r in (res.support_requests or [])}
assert (16, "C") in req_set and (17, "C") in req_set, f"應自動產生 16/17 C 班支援請求，實際 {req_set}"
assert res.schedule[mgr.name][15] == "D" and res.schedule[mgr.name][16] == "D", "管理職 16、17 號應排 D"
non_backup_d = [d + 1 for d, s in enumerate(res.schedule[mgr.name]) if s == "D" and (d + 1) not in (16, 17)]
assert non_backup_d == [], f"非備援日不應主動自動排 D，實際 {non_backup_d}"
assert res.schedule[g1.name][15] == "OFF" and res.schedule[g1.name][16] == "OFF", "指定休員工 16、17 號應排 OFF"
assert res.schedule[g2.name][15] == "A" and res.schedule[g2.name][16] == "A", "A 班員工 16、17 號應排 A"

data2 = data_loader.load(db, year2, month2)
sched_by_id = {e.id: res.schedule[e.name] for e in data2.employees}
viols2 = validator.validate(data2, sched_by_id)
assert viols2 == [], f"驗證報告應無任何 H1/H11 硬性違規，實際 {viols2}"
print("[PASS] 備援日缺 C 班自動請求二館支援並繼續求解成功（非備援日不主動排 D）")

db.close()
print("=" * 70)
print("MODULE 7 (D BACKUP CHAIN) ALL CHECKS PASSED")
