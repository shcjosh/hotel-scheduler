"""覆蓋式匯入（第二步）測試：驗證＋備份＋原子換檔。

執行：cd backend && .venv/bin/python tests/test_database_import.py
"""
import asyncio
import os
import sqlite3
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["DATA_DIR"] = tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import HTTPException, Request

from app.api.routes import database as db_routes
from app.config import DB_PATH
from app.database.connection import SessionLocal, init_db
from app.database.models import Employee

init_db()


class FakeReceive:
    def __init__(self, body: bytes):
        self._body = body
        self._sent = False

    async def __call__(self):
        if not self._sent:
            self._sent = True
            return {"type": "http.request", "body": self._body, "more_body": False}
        return {"type": "http.disconnect"}


def post_import(body: bytes, content_type: str = "application/octet-stream"):
    scope = {
        "type": "http",
        "method": "POST",
        "headers": [(b"content-type", content_type.encode()),
                    (b"content-length", str(len(body)).encode())],
    }
    return asyncio.run(db_routes.import_database(Request(scope, FakeReceive(body))))


def expect_400(body: bytes, label: str):
    try:
        post_import(body)
    except HTTPException as exc:
        assert exc.status_code == 400, (label, exc.status_code)
        print(f"[PASS] {label}正確拒絕：{exc.detail}")
        return
    raise AssertionError(f"{label} 應該被拒絕卻通過了")


# 1. 非 SQLite 直接擋
expect_400(b"hello, this is not a database", "純文字檔")
# 2. 空內容擋
expect_400(b"", "空內容")
# 3. SQLite 但缺表擋
other = os.path.join(tmp, "other.db")
con = sqlite3.connect(other)
con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")
con.commit()
con.close()
with open(other, "rb") as f:
    expect_400(f.read(), "缺表 SQLite")

# 4. 正常匯入：來源庫用「完整 schema 的複本」改裝（含 2 員工），當前庫先放 1 員工
import shutil

db = SessionLocal()
db.add(Employee(name="舊資料", role="general", available_shifts='["A"]',
                preferred_shift=None, scheduling_mode="auto"))
db.commit()
db.close()
src = os.path.join(tmp, "src.db")
shutil.copy2(os.environ["DB_PATH"], src)
con = sqlite3.connect(src)
con.execute("DELETE FROM employees")
con.execute(
    "INSERT INTO employees (name, role, available_shifts, scheduling_mode,"
    " sort_order, is_active, created_at, updated_at)"
    " VALUES ('A','general','[\"A\"]','auto',0,1,'t','t'),"
    "         ('B','general','[\"A\"]','auto',1,1,'t','t')"
)
con.commit()
con.close()
with open(src, "rb") as f:
    result = post_import(f.read())
assert result["imported"]["employees"] == 2, result
assert result["backup"] is not None, result
print(f"[PASS] 匯入成功，備份檔：{result['backup']}")

# 5. 換檔生效＋備份內容是舊庫
db = SessionLocal()
names = [e.name for e in db.query(Employee).all()]
db.close()
assert names == ["A", "B"], names
print("[PASS] 匯入後資料已換成來源庫內容")
con = sqlite3.connect(os.path.join(tmp, result["backup"]))
assert con.execute("SELECT name FROM employees").fetchone()[0] == "舊資料"
con.close()
print("[PASS] 備份檔保留舊資料，可回滾")
assert DB_PATH.is_file()
print("=" * 70)
print("DATABASE IMPORT ALL CHECKS PASSED")
