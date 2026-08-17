from dataclasses import dataclass, field
import os

from ortools.sat.python import cp_model

from app.scheduler.constraints import hard, soft
from app.scheduler.data_loader import ShiftScheduleData
from app.scheduler.diagnostics import diagnose

ALL_SHIFTS = hard.ALL_SHIFTS


@dataclass
class SolveResult:
    success: bool
    schedule: dict[str, list[str]] | None
    error: str | None
    solve_time: float
    violations: list = None
    objective_value: float | None = None
    soft_constraint_stats: dict | None = None
    diagnostics: dict | None = None


def build_fixed(data: ShiftScheduleData) -> dict[tuple[int, int], str]:
    fixed: dict[tuple[int, int], str] = {}
    for i, emp in enumerate(data.employees):
        for d in range(data.num_days):
            day = d + 1
            shift = None
            if emp.role == "night":
                shift = data.night_schedule.get(emp.id, {}).get(day, "OFF")
            elif day in data.designated_off_days.get(emp.id, []):
                shift = "OFF"
            elif day in data.special_leaves.get(emp.id, []):
                shift = "SPECIAL"
            elif emp.role == "cd_backup" and data.d_backup_assignments.get(day) == emp.id:
                shift = "D"
            if shift is not None:
                fixed[(i, d)] = shift
    return fixed


def solve(data: ShiftScheduleData, max_time: float = 30.0) -> SolveResult:
    model = cp_model.CpModel()
    n = len(data.employees)
    if n == 0:
        return SolveResult(False, None, "無員工資料", 0.0)

    x: dict[int, dict[int, dict[str, cp_model.BoolVar]]] = {}
    for i in range(n):
        x[i] = {}
        for d in range(data.num_days):
            x[i][d] = {
                s: model.NewBoolVar(f"x_{i}_{d}_{s}") for s in ALL_SHIFTS
            }

    fixed = build_fixed(data)

    for (i, d), shift in fixed.items():
        if shift == "SPECIAL":
            model.Add(x[i][d]["SPECIAL"] == 1)

    for code, fn in hard.CONSTRAINT_FUNCTIONS:
        fn(model, x, data, fixed)

    trackers = soft.add_soft_constraints(model, x, data, fixed)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_time
    solver.parameters.num_search_workers = 8
    solver.parameters.log_search_progress = (
        os.environ.get("SCHEDULER_LOG_SEARCH_PROGRESS", "0") == "1"
    )
    status = solver.Solve(model)
    solve_time = float(solver.WallTime())

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule = _extract(solver, x, data)
        stats = _extract_soft_stats(solver, trackers)
        return SolveResult(
            True,
            schedule,
            None,
            solve_time,
            None,
            float(solver.ObjectiveValue()),
            stats,
        )

    issues = diagnose(data)
    error = "排班失敗（無合法解）"
    if issues:
        error += "：" + "; ".join(issues)
    from app.scheduler.diagnostics import diagnose_detailed
    return SolveResult(False, None, error, solve_time, issues, None, None, diagnose_detailed(data))


def _extract_soft_stats(solver, trackers) -> dict:
    def total(key):
        return int(round(sum(solver.Value(v) for v in trackers[key])))

    stats = {
        "s1_5consecutive_count": total("s1"),
        "s2_b_to_a_count": total("s2"),
        "s3_c_to_b_count": total("s3"),
        "s4_c_to_d_count": total("s4"),
        "s5_preferred_satisfied": total("s5"),
        "s7_non_backup_d_count": total("s7"),
        "s8_manager_backup_count": total("s8"),
    }
    if trackers.get("s6_max") is not None:
        stats["s6_work_days_spread"] = int(
            solver.Value(trackers["s6_max"]) - solver.Value(trackers["s6_min"])
        )
    else:
        stats["s6_work_days_spread"] = 0
    return stats


def _extract(solver, x, data: ShiftScheduleData) -> dict[str, list[str]]:
    schedule: dict[str, list[str]] = {}
    for i, emp in enumerate(data.employees):
        row: list[str] = []
        for d in range(data.num_days):
            chosen = None
            for s in ALL_SHIFTS:
                if solver.Value(x[i][d][s]) == 1:
                    chosen = s
                    break
            row.append(chosen if chosen is not None else "OFF")
        schedule[emp.name] = row
    return schedule
