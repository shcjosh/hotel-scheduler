from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.stats import MonthStatsResponse
from app.services import stats_service

router = APIRouter()


@router.get("/stats/{year}/{month}", response_model=MonthStatsResponse)
def get_month_stats(year: int, month: int, db: Session = Depends(get_db)):
    return stats_service.get_month_stats(db, year, month)
