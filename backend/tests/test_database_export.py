"""整庫資訊與匯出（唯讀，第一步）測試。

執行：cd backend && .venv/bin/python tests/test_database_export.py
"""
import os
import sqlite3
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import BackgroundTasks

from app.api.routes import database as db_routes
from app.database.connection import SessionLocal, init_db
from app.database.models import Employee, ScheduleEntry
from app.services import snapshot_service

init_db()
db = SessionLocal()

db.add(Employee(name="王先生", role="general", available_shifts='["A","B","C"]',
                preferred_shift=None, scheduling_mode="auto"))
db.commit()
db.add(ScheduleEntry(employee_id=1, year=2026, month=8, day=1, shift="A", source="manual"))
db.commit()
snapshot_service.create_snapshot(db, 2026, 8, name="t1")

info = db_routes.database_info(db)
assert info["counts"]["employees"] == 1, info
assert info["counts"]["schedule_entries"] == 1, info
assert info["counts"]["snapshots"] == 1, info
assert info["db_size_bytes"] > 0, info
assert info["db_mtime"], info
print("[PASS] database_info 筆數/大小/時間正確")

resp = db_routes.export_database(BackgroundTasks())
path = resp.path
assert path.endswith(".db") and os.path.isfile(path), path
assert resp.filename.startswith("scheduler-backup-"), resp.filename
assert resp.media_type == "application/x-sqlite3", resp.media_type

con = sqlite3.connect(path)
try:
    assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert con.execute("SELECT COUNT(*) FROM employees").fetchone()[0] == 1
    assert con.execute("SELECT COUNT(*) FROM schedule_entries").fetchone()[0] == 1
    assert con.execute("SELECT COUNT(*) FROM schedule_snapshots").fetchone()[0] == 1
finally:
    con.close()
print("[PASS] 匯出檔為有效 SQLite 且內容一致")

os.unlink(path)
db.close()
print("=" * 70)
print("DATABASE EXPORT (READ-ONLY) ALL CHECKS PASSED")
