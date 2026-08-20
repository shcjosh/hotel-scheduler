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
causes = result.diagnostics["likely_causes"]
assert any(c["type"] == "d_backup_unfillable" and c.get("day") == 11 for c in causes), "診斷應含 d_backup_unfillable(day=11)"
print("[PASS] 無 CD 備援 + 管理職請假 → 求解失敗並說明原因")

db.close()
print("=" * 70)
print("MODULE 7 (D BACKUP CHAIN) ALL CHECKS PASSED")
