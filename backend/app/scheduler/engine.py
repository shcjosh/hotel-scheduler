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
        "s5_preferred_satisfied": total("s5"),
        "s7_non_backup_d_count": total("s7"),
        "s8_manager_backup_count": total("s8"),
        "s9_off_block_count": total("s9"),
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


def diagnose_support_needs(data: ShiftScheduleData, max_time: float = 15.0):
    """Find the minimum set of (day, shift) needing external A/C support.

    Adds a boolean "external support" variable per (day, A/C) that can satisfy
    the H1 coverage minimum, then MINIMIZES the total number of external slots.
    This pinpoints exactly which days/shifts are short, whether the root cause
    is coverage (H1), weekly rest (H2), or consecutive-work (H4) capacity.

    Returns (days_needing_A, days_needing_C) as sets of 1-based days, or None
    if the model is infeasible even with unlimited support (non-coverage cause
    such as H6/H8/H11/H13).
    """
    model = cp_model.CpModel()
    n = len(data.employees)
    if n == 0:
        return set(), set()

    x: dict[int, dict[int, dict[str, cp_model.BoolVar]]] = {}
    for i in range(n):
        x[i] = {}
        for d in range(data.num_days):
            x[i][d] = {
                s: model.NewBoolVar(f"dx_{i}_{d}_{s}") for s in ALL_SHIFTS
            }

    fixed = build_fixed(data)
    for (i, d), shift in fixed.items():
        if shift == "SPECIAL":
            model.Add(x[i][d]["SPECIAL"] == 1)

    for code, fn in hard.CONSTRAINT_FUNCTIONS:
        if code == "H1":
            continue
        fn(model, x, data, fixed)

    ext_a: dict[int, cp_model.BoolVar] = {}
    ext_c: dict[int, cp_model.BoolVar] = {}
    for d in range(data.num_days):
        day = d + 1
        a = [x[i][d]["A"] for i in range(n)]
        c = [x[i][d]["C"] for i in range(n)]
        b = [x[i][d]["B"] for i in range(n)]
        dd = [
            x[i][d]["D"] for i in range(n)
            if not (data.employees[i].role == "night" and data.employees[i].id in data.night_ignore_all)
        ]
        ea = model.NewBoolVar(f"ea_{d}")
        ec = model.NewBoolVar(f"ec_{d}")
        ext_a[d] = ea
        ext_c[d] = ec

        if data.is_external(day, "A"):
            model.Add(ea == 0)
        else:
            model.Add(sum(a) + ea >= 1)
        model.Add(sum(a) <= 2)

        if data.is_external(day, "C"):
            model.Add(ec == 0)
        else:
            model.Add(sum(c) + ec >= 1)
        model.Add(sum(c) <= 2)

        model.Add(sum(b) <= 2)
        if dd:
            model.Add(sum(dd) <= 1)

    model.Minimize(sum(ext_a.values()) + sum(ext_c.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_time
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    days_a = {d + 1 for d in ext_a if solver.Value(ext_a[d]) == 1}
    days_c = {d + 1 for d in ext_c if solver.Value(ext_c[d]) == 1}
    return days_a, days_c
