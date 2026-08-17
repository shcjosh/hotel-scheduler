from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.solve import SolveRequest, SolveResponse
from app.scheduler import data_loader, engine
from app.services import schedule_service

router = APIRouter()


def _source_for(emp, day, shift, data) -> str:
    if emp.role == "night":
        return "night_input"
    if day in data.designated_off_days.get(emp.id, []):
        return "designated"
    if day in data.special_leaves.get(emp.id, []):
        return "special"
    if emp.role == "cd_backup" and data.d_backup_assignments.get(day) == emp.id:
        return "backup"
    return "auto"


@router.post("/solve", response_model=SolveResponse)
def solve(req: SolveRequest, db: Session = Depends(get_db)):
    data = data_loader.load(db, req.year, req.month)
    result = engine.solve(data, max_time=req.max_solve_time)

    if result.success and result.schedule:
        name_to_emp = {e.name: e for e in data.employees}
        entries = []
        for emp in data.employees:
            row = result.schedule.get(emp.name)
            if not row:
                continue
            for d_idx, shift in enumerate(row):
                entries.append(
                    {
                        "employee_id": emp.id,
                        "day": d_idx + 1,
                        "shift": shift,
                        "source": _source_for(emp, d_idx + 1, shift, data),
                    }
                )
        schedule_service.replace_month_schedule(db, req.year, req.month, entries)

    return SolveResponse(
        success=result.success,
        schedule=result.schedule,
        error=result.error,
        solve_time=round(result.solve_time, 3),
        violations=result.violations,
        objective_value=round(result.objective_value, 3)
        if result.objective_value is not None
        else None,
        soft_constraint_stats=result.soft_constraint_stats,
    )
