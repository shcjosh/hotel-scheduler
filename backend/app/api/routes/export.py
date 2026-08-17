import csv
import io
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services import schedule_service, stats_service

router = APIRouter()

WORK_SHIFTS = ("A", "B", "C", "D", "M")
CSV_MAP = {"OFF": "O", "SPECIAL": "S"}


@router.get("/export/{year}/{month}/csv")
def export_csv(year: int, month: int, db: Session = Depends(get_db)):
    import calendar
    num_days = calendar.monthrange(year, month)[1]
    view = schedule_service.get_month_view(db, year, month, num_days)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["員工"] + [str(d) for d in range(1, num_days + 1)])
    for name, row in view["schedule"].items():
        writer.writerow([name] + [CSV_MAP.get(s, s) or "" for s in row])
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="schedule_{year}_{month:02d}.csv"',
        },
    )


@router.get("/export/{year}/{month}/json")
def export_json(year: int, month: int, db: Session = Depends(get_db)):
    stats = stats_service.get_month_stats(db, year, month)
    content = json.dumps(stats, ensure_ascii=False, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="schedule_{year}_{month:02d}.json"',
        },
    )
