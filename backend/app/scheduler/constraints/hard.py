ALL_SHIFTS = ["A", "B", "C", "D", "M", "OFF", "SPECIAL"]
WORK_SHIFTS = ["A", "B", "C", "D", "M"]
COVERAGE_BACKUP_SHIFTS = ["A", "B", "C", "D"]
REST_SHIFTS = ["OFF", "SPECIAL"]
DEFAULT_NIGHT_RULES = {"H2", "H3", "H4", "H12"}


def _emp_index(data):
    return {emp.id: i for i, emp in enumerate(data.employees)}


def _rule_enabled(data, emp, rule):
    """Night employees may have per-rule overrides; others always enabled."""
    if emp.role != "night":
        return True
    if emp.id in getattr(data, "night_ignore_all", set()):
        return False
    enabled = getattr(data, "night_rule_overrides", {}).get(emp.id)
    if enabled is None:
        return rule in DEFAULT_NIGHT_RULES
    return rule in enabled


def _is_ignored_night(data, i):
    emp = data.employees[i]
    return emp.role == "night" and emp.id in getattr(data, "night_ignore_all", set())


def add_h1_daily_coverage(model, x, data, fixed, require_min=True):
    n = len(data.employees)
    for d in range(data.num_days):
        day = d + 1
        a = [x[i][d]["A"] for i in range(n)]
        c = [x[i][d]["C"] for i in range(n)]
        b = [x[i][d]["B"] for i in range(n)]
        dd = [x[i][d]["D"] for i in range(n) if not _is_ignored_night(data, i)]
        if require_min and not data.is_external(day, "A"):
            model.Add(sum(a) >= 1)
        model.Add(sum(a) <= 2)
        if require_min and not data.is_external(day, "C"):
            model.Add(sum(c) >= 1)
        model.Add(sum(c) <= 2)
        model.Add(sum(b) <= 1)
        if dd:
            model.Add(sum(dd) <= 1)


def add_h2_weekly_off_days(model, x, data, fixed):
    n = len(data.employees)
    for w in data.weeks[1:]:
        for i in range(n):
            if not _rule_enabled(data, data.employees[i], "H2"):
                continue
            off_sum = sum(x[i][d]["OFF"] for d in w)
            if len(w) >= 5:
                model.Add(off_sum == 2)
            else:
                model.Add(off_sum <= 2)


def add_h3_weekend_limit(model, x, data, fixed):
    n = len(data.employees)
    for i in range(n):
        if not _rule_enabled(data, data.employees[i], "H3"):
            continue
        sat_off = sum(x[i][d]["OFF"] for d in data.saturdays)
        sun_off = sum(x[i][d]["OFF"] for d in data.sundays)
        model.Add(sat_off + sun_off <= 2)


def add_h4_max_consecutive_work(model, x, data, fixed):
    n = len(data.employees)
    for i in range(n):
        if not _rule_enabled(data, data.employees[i], "H4"):
            continue
        for d in range(data.num_days - 5):
            rest = sum(
                x[i][d + k]["OFF"] + x[i][d + k]["SPECIAL"] for k in range(6)
            )
            model.Add(rest >= 1)


def add_h5_shift_transition_hard(model, x, data, fixed):
    n = len(data.employees)
    for i in range(n):
        for d in range(data.num_days - 1):
            model.Add(x[i][d]["C"] + x[i][d + 1]["A"] <= 1)
            model.Add(x[i][d]["D"] + x[i][d + 1]["A"] <= 1)
            model.Add(x[i][d]["D"] + x[i][d + 1]["C"] <= 1)
            model.Add(x[i][d]["D"] + x[i][d + 1]["M"] <= 1)


def add_h6_designated_off(model, x, data, fixed):
    idx = _emp_index(data)
    for emp_id, days in data.designated_off_days.items():
        i = idx.get(emp_id)
        if i is None:
            continue
        for day in days:
            model.Add(x[i][day - 1]["OFF"] == 1)


def add_h7_available_shifts(model, x, data, fixed):
    for i, emp in enumerate(data.employees):
        avail = set(emp.available_shifts)
        for d in range(data.num_days):
            if (i, d) in fixed:
                continue
            allowed = avail | {"OFF"}
            for s in ALL_SHIFTS:
                if s not in allowed:
                    model.Add(x[i][d][s] == 0)


def _prev_shift(prev_list, j):
    if not prev_list or j > len(prev_list):
        return None
    return prev_list[-j]


def _prev_is_rest(prev_list, j):
    s = _prev_shift(prev_list, j)
    return 1 if s in ("OFF", "SPECIAL") else 0


def add_h8_cross_month_transition(model, x, data, fixed):
    idx = _emp_index(data)
    for emp in data.employees:
        i = idx[emp.id]
        prev = data.previous_month.get(emp.id)

        prev_day1 = _prev_shift(prev, 1) if prev else None
        if prev_day1 == "C":
            model.Add(x[i][0]["A"] == 0)
        elif prev_day1 == "D":
            model.Add(x[i][0]["A"] == 0)
            model.Add(x[i][0]["C"] == 0)
            model.Add(x[i][0]["M"] == 0)

        if not prev:
            continue
        for start in range(-5, 0):
            prev_rest = 0
            unknown = False
            for off in range(start, 0):
                j = -off
                s = _prev_shift(prev, j)
                if s is None:
                    unknown = True
                    break
                if s in ("OFF", "SPECIAL"):
                    prev_rest += 1
            if unknown or prev_rest >= 1:
                continue
            curr_days = [o for o in range(start, start + 6) if o >= 0]
            if not curr_days:
                continue
            model.Add(
                sum(x[i][o]["OFF"] + x[i][o]["SPECIAL"] for o in curr_days) >= 1
            )


def add_h9_cross_month_week(model, x, data, fixed):
    if not data.weeks:
        return
    idx = _emp_index(data)
    w0 = data.weeks[0]
    weekday_day1 = data.dates[0].weekday()
    for emp in data.employees:
        i = idx[emp.id]
        if not _rule_enabled(data, emp, "H2"):
            continue
        prev = data.previous_month.get(emp.id)
        off_sum = sum(x[i][d]["OFF"] for d in w0)
        if prev and weekday_day1 > 0:
            prev_off = 0
            for j in range(1, min(weekday_day1, 5) + 1):
                if _prev_shift(prev, j) == "OFF":
                    prev_off += 1
            target = max(0, 2 - prev_off)
            model.Add(off_sum == target)
        else:
            if len(w0) >= 5:
                model.Add(off_sum == 2)
            else:
                model.Add(off_sum <= 2)


def add_h10_one_shift_per_day(model, x, data, fixed):
    n = len(data.employees)
    for i in range(n):
        for d in range(data.num_days):
            model.Add(sum(x[i][d][s] for s in ALL_SHIFTS) == 1)


def add_h11_d_backup(model, x, data, fixed):
    idx = _emp_index(data)
    n = len(data.employees)
    for day, emp_id in data.d_backup_assignments.items():
        i = idx.get(emp_id)
        if i is None:
            continue
        d = day - 1
        model.Add(x[i][d]["D"] == 1)
        others = [k for k in range(n) if k != i]
        if others:
            model.Add(sum(x[k][d]["C"] for k in others) >= 1)


def build_off_block_counters(model, x, i, num_days):
    """Return the counted_end BoolVars for employee i.

    A 連休 = a maximal run of non-work days (OFF + SPECIAL) with length >=2 that
    contains at least one OFF. counted_end[d] == 1 iff such a block ends at day d.
    """
    nw = [x[i][d]["OFF"] + x[i][d]["SPECIAL"] for d in range(num_days)]

    seen_off = []
    for d in range(num_days):
        so = model.NewBoolVar(f"h12_so_{i}_{d}")
        model.Add(so <= nw[d])
        model.Add(so >= x[i][d]["OFF"])
        if d == 0:
            model.Add(so <= x[i][d]["OFF"])
        else:
            model.Add(so >= seen_off[d - 1] + nw[d] - 1)
            model.Add(so <= x[i][d]["OFF"] + seen_off[d - 1])
        seen_off.append(so)

    counted_end = []
    for d in range(num_days):
        ce = model.NewBoolVar(f"h12_ce_{i}_{d}")
        is_end = 1 if d == num_days - 1 else (1 - nw[d + 1])
        has_prev = 0 if d == 0 else nw[d - 1]
        model.Add(ce <= nw[d])
        model.Add(ce <= is_end)
        model.Add(ce <= has_prev)
        model.Add(ce <= seen_off[d])
        model.Add(ce >= nw[d] + is_end + has_prev + seen_off[d] - 3)
        counted_end.append(ce)
    return counted_end


def add_h12_consecutive_off(model, x, data, fixed):
    """H12: 每人每月「1~2 次」連休。"""
    n = len(data.employees)
    for i in range(n):
        if not _rule_enabled(data, data.employees[i], "H12"):
            continue
        counted_end = build_off_block_counters(model, x, i, data.num_days)
        model.Add(sum(counted_end) >= 1)
        model.Add(sum(counted_end) <= 2)


def add_h13_night_manual(model, x, data, fixed):
    idx = _emp_index(data)
    for emp in data.employees:
        if emp.role != "night":
            continue
        i = idx[emp.id]
        nights = data.night_schedule.get(emp.id, {})
        for d in range(data.num_days):
            shift = nights.get(d + 1, "OFF")
            if shift in ALL_SHIFTS:
                model.Add(x[i][d][shift] == 1)


CONSTRAINT_FUNCTIONS = [
    ("H1", add_h1_daily_coverage),
    ("H2", add_h2_weekly_off_days),
    ("H3", add_h3_weekend_limit),
    ("H4", add_h4_max_consecutive_work),
    ("H5", add_h5_shift_transition_hard),
    ("H6", add_h6_designated_off),
    ("H7", add_h7_available_shifts),
    ("H8", add_h8_cross_month_transition),
    ("H9", add_h9_cross_month_week),
    ("H10", add_h10_one_shift_per_day),
    ("H11", add_h11_d_backup),
    ("H12", add_h12_consecutive_off),
    ("H13", add_h13_night_manual),
]
