"""資料庫整庫資訊與匯出（唯讀）＋覆蓋式匯入。

用途：離線版 ↔ Docker 版同步——整庫（含全部月份、設定、快照、異動紀錄）
一次打包下載，拿到另一邊匯入。匯出用 `VACUUM INTO` 產生一致性快照，
不直接讀取線上 DB 檔，避免寫入中途拷到半個檔。

匯入為整庫覆蓋（非合併），流程：收檔（octet-stream，不用 multipart 依賴）→
驗魔術 header＋必要表＋integrity_check → 自動備份當前庫（留最近 5 份）→
原子換檔（os.replace）→ engine.dispose() 重連。
"""
import shutil
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import DATA_DIR, DB_PATH
from app.database.connection import engine
from app.database.models import Employee, ScheduleEntry, ScheduleSnapshot
from app.version import __version__

router = APIRouter()

REQUIRED_TABLES = {"employees", "schedule_entries"}
MAX_IMPORT_BYTES = 50 * 1024 * 1024
BACKUP_KEEP = 5


@router.get("/database/info")
def database_info(db: Session = Depends(get_db)):
    if not DB_PATH.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="資料庫檔案不存在"
        )
    st = DB_PATH.stat()
    return {
        "app_version": __version__,
        "db_size_bytes": st.st_size,
        "db_mtime": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
        "counts": {
            "employees": db.query(func.count(Employee.id)).scalar(),
            "schedule_entries": db.query(func.count(ScheduleEntry.id)).scalar(),
            "snapshots": db.query(func.count(ScheduleSnapshot.id)).scalar(),
        },
    }


@router.get("/database/export")
def export_database(background: BackgroundTasks):
    if not DB_PATH.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="資料庫檔案不存在"
        )
    tmp = tempfile.NamedTemporaryFile(
        prefix="scheduler-export-", suffix=".db", delete=False
    )
    tmp.close()
    src = sqlite3.connect(DB_PATH)
    try:
        src.execute("VACUUM INTO ?", (tmp.name,))
    finally:
        src.close()
    background.add_task(Path(tmp.name).unlink, missing_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return FileResponse(
        tmp.name,
        media_type="application/x-sqlite3",
        filename=f"scheduler-backup-{stamp}.db",
        background=background,
    )


def _validate_import_file(path: str) -> dict:
    """驗上傳檔是否為可用的排班資料庫；通過回傳筆數摘要，否則 ValueError。"""
    with open(path, "rb") as f:
        if f.read(16) != b"SQLite format 3\x00":
            raise ValueError("不是 SQLite 資料庫檔")
    con = sqlite3.connect(path)
    try:
        tables = {
            r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if not REQUIRED_TABLES.issubset(tables):
            raise ValueError("缺少必要資料表，非排班資料庫")
        if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("檔案完整性檢查未通過")
        return {
            "employees": con.execute("SELECT COUNT(*) FROM employees").fetchone()[0],
            "schedule_entries": con.execute(
                "SELECT COUNT(*) FROM schedule_entries"
            ).fetchone()[0],
            "snapshots": con.execute("SELECT COUNT(*) FROM schedule_snapshots").fetchone()[0]
            if "schedule_snapshots" in tables
            else 0,
        }
    finally:
        con.close()


@router.post("/database/import")
async def import_database(request: Request):
    ct = request.headers.get("content-type", "")
    if ct.startswith("multipart/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="請以 application/octet-stream 直接送檔案內容（不支援 multipart 表單）",
        )
    body = await request.body()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="沒有收到檔案內容"
        )
    if len(body) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="檔案超過 50MB 上限"
        )
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(
        # 暫存檔必須跟 DB 同目錄：os.replace 跨檔案系統會 EXDEV（線上實測 500 事件，2026-10-26）
        dir=str(DATA_DIR),
        prefix="scheduler-import-",
        suffix=".db",
        delete=False,
    )
    try:
        tmp.write(body)
        tmp.close()
        try:
            summary = _validate_import_file(tmp.name)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            )
        # 先備份當前庫，再原子換檔
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = DATA_DIR / f"scheduler-backup-{stamp}.db"
        if DB_PATH.is_file():
            shutil.copy2(DB_PATH, backup)
            for old in sorted(DATA_DIR.glob("scheduler-backup-*.db"))[:-BACKUP_KEEP]:
                old.unlink(missing_ok=True)
        else:
            backup = None
        Path(tmp.name).replace(DB_PATH)
        # 暫存檔預設 600，換入後補 644，避免之後非 root 讀取（備份/FileBrowser）踩到
        DB_PATH.chmod(0o644)
        engine.dispose()
    finally:
        Path(tmp.name).unlink(missing_ok=True)
    return {"backup": backup.name if backup else None, "imported": summary}
