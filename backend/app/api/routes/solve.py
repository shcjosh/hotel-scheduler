from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.solve import SolveRequest, SolveResponse
from app.scheduler import data_loader, engine
from app.services import schedule_service, snapshot_service, stats_service, status_service, support_service

router = APIRouter()


def _source_for(emp, day, shift, data) -> str:
    if emp.role == "night":
        return "night_input"
    if day in data.designated_off_days.get(emp.id, []):
        return "designated"
    if day in data.special_leaves.get(emp.id, []):
        return "special"
    if data.d_backup_assignments.get(day) == emp.id:
        return "backup"
    return "auto"


def _coverage_gaps(data) -> list[dict]:
    """Build support-request gaps: structural (day=0) + solver-identified days."""
    gaps: list[dict] = []
    capable_a = any("A" in e.available_shifts and e.role != "night" for e in data.employees)
    capable_c = any("C" in e.available_shifts and e.role != "night" for e in data.employees)
    if not capable_a:
        gaps.append({"day": 0, "shift": "A", "reason": "全月無員工可上 A 班"})
    if not capable_c:
        gaps.append({"day": 0, "shift": "C", "reason": "全月無員工可上 C 班"})

    if capable_a or capable_c:
        diag = engine.diagnose_support_needs(data)
        if diag is not None:
            days_no_a, days_no_c = diag
            if capable_a:
                for day in sorted(days_no_a):
                    if not data.is_external(day, "A"):
                        gaps.append({"day": day, "shift": "A", "reason": f"{day} 日 A 班人力不足"})
            if capable_c:
                for day in sorted(days_no_c):
                    if not data.is_external(day, "C"):
                        gaps.append({"day": day, "shift": "C", "reason": f"{day} 日 C 班人力不足"})
    return gaps


@router.post("/solve", response_model=SolveResponse)
def solve(req: SolveRequest, db: Session = Depends(get_db)):
    if status_service.get_status(db, req.year, req.month) == "locked":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="班表已鎖定，無法重新排班"
        )

    data = data_loader.load(db, req.year, req.month)
    result = engine.solve(data, max_time=req.max_solve_time)
    support_requests = None

    if not result.success and not data.d_backup_unfillable:
        gaps = _coverage_gaps(data)
        support_requests = support_service.generate_from_gaps(db, gaps, req.year, req.month)
        if support_requests:
            data = data_loader.load(db, req.year, req.month)
            result = engine.solve(data, max_time=req.max_solve_time)
        else:
            support_requests = support_service.auto_generate_from_diagnostics(
                db, result.diagnostics, req.year, req.month
            )

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
        snapshot_service.create_snapshot(db, req.year, req.month, name="自動排班結果")

    stats_service.store_solve_meta(
        db, req.year, req.month, result.success,
        result.objective_value, result.solve_time, result.soft_constraint_stats,
    )

    if not result.success and support_requests is None:
        support_requests = support_service.auto_generate_from_diagnostics(
            db, result.diagnostics, req.year, req.month
        )

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
        diagnostics=result.diagnostics,
        support_requests=support_requests,
    )
