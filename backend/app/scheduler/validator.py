from app.scheduler.constraints.hard import ALL_SHIFTS, REST_SHIFTS, WORK_SHIFTS


def _shift_at(schedule, emp_id, day_idx):
    row = schedule.get(emp_id)
    if row is None or day_idx >= len(row):
        return None
    return row[day_idx]


def _is_rest(s):
    return s in REST_SHIFTS


def _is_work(s):
    return s in WORK_SHIFTS


def validate(data, schedule):
    """schedule: {emp_id: [shift per day_idx]}."""
    violations = []
    idx = data.emp_index()
    n = len(data.employees)

    def emp_name(eid):
        i = idx.get(eid)
        return data.employees[i].name if i is not None else f"#{eid}"

    for d in range(data.num_days):
        counts = {s: 0 for s in ALL_SHIFTS}
        for emp in data.employees:
            s = _shift_at(schedule, emp.id, d)
            if s in counts:
                counts[s] += 1
        if counts["A"] < 1:
            violations.append(("H1", f"{data.month}/{d+1} A 班無人"))
        if counts["A"] > 2:
            violations.append(("H1", f"{data.month}/{d+1} A 班超過 2 人"))
        if counts["C"] < 1:
            violations.append(("H1", f"{data.month}/{d+1} C 班無人"))
        if counts["C"] > 2:
            violations.append(("H1", f"{data.month}/{d+1} C 班超過 2 人"))
        if counts["B"] > 2:
            violations.append(("H1", f"{data.month}/{d+1} B 班超過 2 人"))
        if counts["D"] > 1:
            violations.append(("H1", f"{data.month}/{d+1} D 班超過 1 人"))

    prev_cache = {}
    for emp in data.employees:
        prev = data.previous_month.get(emp.id)
        prev_cache[emp.id] = prev

    for w_i, w in enumerate(data.weeks):
        for emp in data.employees:
            curr_off = sum(
                1 for d in w if _shift_at(schedule, emp.id, d) == "OFF"
            )
            if w_i == 0:
                prev = prev_cache[emp.id]
                weekday_day1 = data.dates[0].weekday()
                if prev and weekday_day1 > 0:
                    prev_off = 0
                    for j in range(1, min(weekday_day1, 5) + 1):
                        if prev[-j] == "OFF":
                            prev_off += 1
                    total = prev_off + curr_off
                    if total != 2:
                        violations.append(
                            ("H9", f"{emp.name} 跨月週休假共 {total} 天（應為 2）")
                        )
                else:
                    if len(w) >= 5 and curr_off != 2:
                        violations.append(
                            ("H2", f"{emp.name} 第 {w_i+1} 週休 {curr_off} 天（應為 2）")
                        )
                    if len(w) < 5 and curr_off > 2:
                        violations.append(
                            ("H2", f"{emp.name} 不完整週休 {curr_off} 天（應 <=2）")
                        )
            else:
                if len(w) >= 5 and curr_off != 2:
                    violations.append(
                        ("H2", f"{emp.name} 第 {w_i+1} 週休 {curr_off} 天（應為 2）")
                    )
                if len(w) < 5 and curr_off > 2:
                    violations.append(
                        ("H2", f"{emp.name} 不完整週休 {curr_off} 天（應 <=2）")
                    )

    for emp in data.employees:
        sat_off = sum(
            1 for d in data.saturdays if _shift_at(schedule, emp.id, d) == "OFF"
        )
        sun_off = sum(
            1 for d in data.sundays if _shift_at(schedule, emp.id, d) == "OFF"
        )
        if sat_off > 1:
            violations.append(("H3", f"{emp.name} 週六休假 {sat_off} 天（應 <=1）"))
        if sun_off > 1:
            violations.append(("H3", f"{emp.name} 週日休假 {sun_off} 天（應 <=1）"))

    for emp in data.employees:
        shifts = schedule.get(emp.id, [])
        prev = prev_cache[emp.id]
        for start in range(-5, data.num_days - 5):
            window = []
            ok = True
            for off in range(start, start + 6):
                if off < 0:
                    s = prev[-(-off)] if prev and -off <= len(prev) else None
                    if s is None:
                        ok = False
                        break
                else:
                    s = shifts[off] if off < len(shifts) else None
                window.append(s)
            if not ok or None in window:
                continue
            if not any(_is_rest(s) for s in window):
                violations.append(
                    (
                        "H4",
                        f"{emp.name} 連續 6 天上班（含跨月）起點 day {start+1}",
                    )
                )

    for emp in data.employees:
        shifts = schedule.get(emp.id, [])
        for d in range(data.num_days - 1):
            cur = shifts[d] if d < len(shifts) else None
            nxt = shifts[d + 1] if d + 1 < len(shifts) else None
            if cur == "C" and nxt == "A":
                violations.append(("H5", f"{emp.name} {d+1}→{d+2} C→A 禁止"))
            if cur == "D" and nxt == "A":
                violations.append(("H5", f"{emp.name} {d+1}→{d+2} D→A 禁止"))
            if cur == "D" and nxt == "C":
                violations.append(("H5", f"{emp.name} {d+1}→{d+2} D→C 禁止"))

    for emp in data.employees:
        for day in data.designated_off_days.get(emp.id, []):
            if _shift_at(schedule, emp.id, day - 1) != "OFF":
                violations.append(("H6", f"{emp.name} {day} 號應為指定休假"))

    for emp in data.employees:
        avail = set(emp.available_shifts)
        for d in range(data.num_days):
            s = _shift_at(schedule, emp.id, d)
            if s is None:
                continue
            if s == "OFF" or s == "SPECIAL":
                continue
            if s not in avail:
                violations.append(
                    ("H7", f"{emp.name} {d+1} 號排 {s} 不在可用班次")
                )

    for emp in data.employees:
        shifts = schedule.get(emp.id, [])
        prev = prev_cache[emp.id]
        prev_day1 = prev[-1] if prev else None
        cur0 = shifts[0] if shifts else None
        if prev_day1 == "C" and cur0 == "A":
            violations.append(("H8", f"{emp.name} 上月末 C→本月首 A"))
        if prev_day1 == "D" and cur0 == "A":
            violations.append(("H8", f"{emp.name} 上月末 D→本月首 A"))
        if prev_day1 == "D" and cur0 == "C":
            violations.append(("H8", f"{emp.name} 上月末 D→本月首 C"))

    for emp in data.employees:
        shifts = schedule.get(emp.id, [])
        for d in range(data.num_days):
            s = shifts[d] if d < len(shifts) else None
            if s is not None and s not in ALL_SHIFTS:
                violations.append(("H10", f"{emp.name} {d+1} 號未知班次 {s}"))

    for day, emp_id in data.d_backup_assignments.items():
        idx_e = idx.get(emp_id)
        if idx_e is None:
            continue
        emp = data.employees[idx_e]
        if _shift_at(schedule, emp_id, day - 1) != "D":
            violations.append(("H11", f"{emp.name} {day} 號備援日應排 D"))
        c_count = 0
        for other in data.employees:
            if other.id == emp_id:
                continue
            if _shift_at(schedule, other.id, day - 1) == "C":
                c_count += 1
        if c_count < 1:
            violations.append(("H11", f"{day} 號備援日無人遞補 C 班"))

    for emp in data.employees:
        shifts = schedule.get(emp.id, [])
        runs = 0
        run_len = 0
        prev_off = False
        for d in range(data.num_days):
            s = shifts[d] if d < len(shifts) else None
            if s == "OFF":
                if not prev_off:
                    run_len = 1
                else:
                    run_len += 1
                prev_off = True
            else:
                if prev_off and run_len >= 2:
                    runs += 1
                run_len = 0
                prev_off = False
        if prev_off and run_len >= 2:
            runs += 1
        if runs > 2:
            violations.append(("H12", f"{emp.name} 連休 {runs} 次（應 <=2）"))

    for emp in data.employees:
        if emp.role != "night":
            continue
        nights = data.night_schedule.get(emp.id, {})
        for d in range(data.num_days):
            expected = nights.get(d + 1, "OFF")
            actual = _shift_at(schedule, emp.id, d)
            if actual != expected:
                violations.append(
                    ("H13", f"{emp.name} {d+1} 號大夜應為 {expected} 實為 {actual}")
                )

    return violations
