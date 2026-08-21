from app.scheduler.constraints.hard import (
    COVERAGE_BACKUP_SHIFTS,
    WORK_SHIFTS,
    _rule_enabled,
    build_off_block_counters,
)
from app.scheduler.validator import _prev_day1


def add_s1_avoid_5_consecutive(model, x, data, fixed):
    terms = []
    stat_vars = []
    n = len(data.employees)
    for e in range(n):
        for d in range(data.num_days - 4):
            work_count = sum(
                x[e][d + i][s] for i in range(5) for s in WORK_SHIFTS
            )
            is_five = model.NewBoolVar(f"s1_five_{e}_{d}")
            model.Add(work_count == 5).OnlyEnforceIf(is_five)
            model.Add(work_count < 5).OnlyEnforceIf(is_five.Not())
            terms.append(is_five * (-10))
            stat_vars.append(is_five)
    return terms, {"s1": stat_vars}


def _add_transition_penalty(model, x, e, d, s_from, s_to, weight, tag):
    """Linearize x[d, from] AND x[d+1, to]; return (term, var)."""
    both = model.NewBoolVar(f"{tag}_{e}_{d}")
    model.Add(x[e][d][s_from] + x[e][d + 1][s_to] >= 2).OnlyEnforceIf(both)
    model.Add(x[e][d][s_from] + x[e][d + 1][s_to] <= 1).OnlyEnforceIf(both.Not())
    return both * weight, both


def add_s2_avoid_b_to_a(model, x, data, fixed):
    terms = []
    stat_vars = []
    for e, emp in enumerate(data.employees):
        avail = set(emp.available_shifts)
        if not ({"A", "B"} <= avail):
            continue
        for d in range(data.num_days - 1):
            term, var = _add_transition_penalty(
                model, x, e, d, "B", "A", -5, "s2_ba"
            )
            terms.append(term)
            stat_vars.append(var)
        if _prev_day1(data, emp.id) == "B":
            terms.append(x[e][0]["A"] * (-5))
            stat_vars.append(x[e][0]["A"])
    return terms, {"s2": stat_vars}


def add_s3_avoid_c_to_b(model, x, data, fixed):
    terms = []
    stat_vars = []
    for e, emp in enumerate(data.employees):
        avail = set(emp.available_shifts)
        if not ({"B", "C"} <= avail):
            continue
        for d in range(data.num_days - 1):
            term, var = _add_transition_penalty(
                model, x, e, d, "C", "B", -5, "s3_cb"
            )
            terms.append(term)
            stat_vars.append(var)
        if _prev_day1(data, emp.id) == "C":
            terms.append(x[e][0]["B"] * (-5))
            stat_vars.append(x[e][0]["B"])
    return terms, {"s3": stat_vars}


def add_s5_preferred_shift(model, x, data, fixed):
    terms = []
    stat_vars = []
    for e, emp in enumerate(data.employees):
        p = emp.preferred_shift
        if p is None:
            continue
        for d in range(data.num_days):
            if (e, d) in fixed:
                continue
            terms.append(x[e][d][p] * 5)
            stat_vars.append(x[e][d][p])
    return terms, {"s5": stat_vars}


def add_s6_fairness(model, x, data, fixed):
    n = len(data.employees)
    if n <= 1:
        return [], {"s6_max": None, "s6_min": None}
    totals = [
        sum(x[e][d][s] for d in range(data.num_days) for s in WORK_SHIFTS)
        for e in range(n)
    ]
    max_t = model.NewIntVar(0, data.num_days, "s6_max_work")
    min_t = model.NewIntVar(0, data.num_days, "s6_min_work")
    model.AddMaxEquality(max_t, totals)
    model.AddMinEquality(min_t, totals)
    return [(max_t - min_t) * (-3)], {"s6_max": max_t, "s6_min": min_t}


def add_s7_d_backup_minimize(model, x, data, fixed):
    terms = []
    stat_vars = []
    backup_days = set(data.d_backup_requests)
    for e, emp in enumerate(data.employees):
        if emp.role != "cd_backup":
            continue
        for d in range(data.num_days):
            if (d + 1) in backup_days:
                continue
            terms.append(x[e][d]["D"] * (-2))
            stat_vars.append(x[e][d]["D"])
    return terms, {"s7": stat_vars}


def add_s8_manager_backup_minimize(model, x, data, fixed):
    terms = []
    stat_vars = []
    for e, emp in enumerate(data.employees):
        if emp.role != "manager":
            continue
        for d in range(data.num_days):
            for s in COVERAGE_BACKUP_SHIFTS:
                terms.append(x[e][d][s] * (-15))
                stat_vars.append(x[e][d][s])
    return terms, {"s8": stat_vars}


def add_s9_prefer_off_blocks(model, x, data, fixed):
    """S9: 連休 2 次優先（軟性）。獎勵每人連休次數，把大家往 2 次推。"""
    terms = []
    stat_vars = []
    for e, emp in enumerate(data.employees):
        if not _rule_enabled(data, emp, "H12"):
            continue
        counted_end = build_off_block_counters(model, x, e, data.num_days)
        terms.append(sum(counted_end) * 8)
        stat_vars.extend(counted_end)
    return terms, {"s9": stat_vars}


def add_s10_weekend_staffing(model, x, data, fixed):
    """S10: 週末人力加強。週六/週日盡量加人，優先序 B > 雙 A > 雙 C。"""
    terms = []
    stat_vars = {"s10_b": [], "s10_2a": [], "s10_2c": []}
    n = len(data.employees)
    for d in sorted(set(data.saturdays) | set(data.sundays)):
        b_sum = sum(x[e][d]["B"] for e in range(n))
        terms.append(b_sum * 6)
        stat_vars["s10_b"].append(b_sum)

        a_sum = sum(x[e][d]["A"] for e in range(n))
        two_a = model.NewBoolVar(f"s10_2a_{d}")
        model.Add(a_sum >= 2).OnlyEnforceIf(two_a)
        model.Add(a_sum <= 1).OnlyEnforceIf(two_a.Not())
        terms.append(two_a * 4)
        stat_vars["s10_2a"].append(two_a)

        c_sum = sum(x[e][d]["C"] for e in range(n))
        two_c = model.NewBoolVar(f"s10_2c_{d}")
        model.Add(c_sum >= 2).OnlyEnforceIf(two_c)
        model.Add(c_sum <= 1).OnlyEnforceIf(two_c.Not())
        terms.append(two_c * 2)
        stat_vars["s10_2c"].append(two_c)
    return terms, stat_vars


SOFT_FUNCTIONS = [
    ("S1", add_s1_avoid_5_consecutive),
    ("S2", add_s2_avoid_b_to_a),
    ("S3", add_s3_avoid_c_to_b),
    ("S5", add_s5_preferred_shift),
    ("S6", add_s6_fairness),
    ("S7", add_s7_d_backup_minimize),
    ("S8", add_s8_manager_backup_minimize),
    ("S9", add_s9_prefer_off_blocks),
    ("S10", add_s10_weekend_staffing),
]


def add_soft_constraints(model, x, data, fixed):
    obj_terms = []
    trackers: dict = {}
    for _, fn in SOFT_FUNCTIONS:
        terms, stats = fn(model, x, data, fixed)
        obj_terms.extend(terms)
        trackers.update(stats)
    if obj_terms:
        model.Maximize(sum(obj_terms))
    return trackers
