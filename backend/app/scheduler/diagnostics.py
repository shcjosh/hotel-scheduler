from app.scheduler.constraints.hard import ALL_SHIFTS, REST_SHIFTS


def diagnose(data):
    issues = []
    idx = data.emp_index()
    cd_backup = [e for e in data.employees if e.role == "cd_backup"]
    general = [e for e in data.employees if e.role == "general"]

    a_capable = [
        e for e in data.employees if "A" in e.available_shifts and e.role != "night"
    ]
    c_capable = [
        e for e in data.employees if "C" in e.available_shifts and e.role != "night"
    ]
    if len(a_capable) < 1:
        issues.append("H1: 無一般員工可上 A 班，每日 A 班覆蓋不可能")
    if len(c_capable) < 1:
        issues.append("H1: 無員工可上 C 班，每日 C 班覆蓋不可能")

    for emp in data.employees:
        days = data.designated_off_days.get(emp.id, [])
        if len(days) > 2:
            issues.append(
                f"H6: {emp.name} 指定休假 {len(days)} 天（每月最多 2 天）"
            )
        spe = data.special_leaves.get(emp.id, [])
        overlap = set(days) & set(spe)
        if overlap:
            issues.append(
                f"H6/H7: {emp.name} 同一天同時指定休假與特休 {sorted(overlap)}"
            )
        mandatory = _mandatory_weekend_off(data, emp.id)
        if mandatory > 2:
            issues.append(
                f"H3: {emp.name} 平日請假過多，被迫週末休假 {mandatory} 天（最多 1 週六 + 1 週日）"
            )
        if emp.role != "night":
            for issue in _weekly_off_shortage(data, emp.id):
                issues.append(
                    f"H2: {emp.name} 特休涵蓋 {issue['days'][0]}~{issue['days'][-1]} 日整週，一般休不足（特休不計入每週休 2 天）"
                )

    for day, emp_id in data.d_backup_assignments.items():
        i = idx.get(emp_id)
        if i is None:
            issues.append(f"H11: {day} 號備援日指派員工不存在")
            continue
        candidates = [
            e
            for e in data.employees
            if e.id != emp_id
            and "C" in e.available_shifts
            and e.role != "night"
        ]
        fixed_non_c = 0
        for e in candidates:
            spe = day in data.special_leaves.get(e.id, [])
            des = day in data.designated_off_days.get(e.id, [])
            if spe or des:
                fixed_non_c += 1
        if len(candidates) - fixed_non_c < 1:
            issues.append(
                f"H11: {day} 號備援日無其他員工可遞補 C 班"
            )

    for emp in data.employees:
        prev = data.previous_month.get(emp.id)
        if not prev:
            continue
        prev_day1 = prev[-1]
        forced = []
        if day_in(emp.id, 1, data.designated_off_days):
            forced.append("OFF")
        if day_in(emp.id, 1, data.special_leaves):
            forced.append("SPECIAL")
        if emp.role == "cd_backup" and data.d_backup_assignments.get(1) == emp.id:
            forced.append("D")
        if not forced:
            continue
        if prev_day1 == "C" and "A" in forced:
            issues.append(
                f"H8: {emp.name} 上月末 C 班，本月 1 號固定為 {forced}（A 違規）"
            )
        if prev_day1 == "D" and ("A" in forced or "C" in forced):
            issues.append(
                f"H8: {emp.name} 上月末 D 班，本月 1 號固定為 {forced}（A/C 違規）"
            )

    night_partial = {}
    for emp in data.employees:
        if emp.role != "night":
            continue
        nights = data.night_schedule.get(emp.id, {})
        row = [nights.get(d + 1, "OFF") for d in range(data.num_days)]
        night_partial[emp.id] = row
    if night_partial:
        import dataclasses

        from app.scheduler import validator

        night_data = dataclasses.replace(
            data, employees=[e for e in data.employees if e.role == "night"]
        )
        viols = validator.validate(night_data, night_partial)
        for v in viols:
            if v["rule"] in ("H2", "H3", "H4", "H12"):
                issues.append(f"H13(大夜): {v['message']}")

    return issues


def day_in(emp_id, day, mapping):
    return day in mapping.get(emp_id, [])


def _mandatory_weekend_off(data, emp_id) -> int:
    """Minimum weekend OFF days an employee must take to satisfy H2 (2 OFF/week).

    If an employee has many weekday leaves (special/designated), the weekly 2-OFF
    requirement may force them to rest on weekends, potentially violating H3.
    """
    special = set(data.special_leaves.get(emp_id, []))
    designated = set(data.designated_off_days.get(emp_id, []))
    mandatory = 0
    for week in data.weeks:
        if len(week) < 5:
            continue
        designated_in_week = 0
        weekday_free = 0
        for d in week:
            day = d + 1
            if data.dates[d].weekday() >= 5:
                continue
            if day in designated:
                designated_in_week += 1
                continue
            if day in special:
                continue
            weekday_free += 1
        need = 2 - designated_in_week
        if need > 0 and weekday_free < need:
            mandatory += need - weekday_free
    return mandatory


def _weekly_off_shortage(data, emp_id) -> list[dict]:
    """Find full weeks where the employee cannot take the required 2 OFF days.

    Special leave (SPECIAL) does not count toward H2's weekly 2 OFF, so if an
    employee takes special leave for (nearly) a whole week they have no days left
    to rest, violating H2. Returns [{days, shortage}] for each conflicting week.
    """
    special = set(data.special_leaves.get(emp_id, []))
    designated = set(data.designated_off_days.get(emp_id, []))
    backup_days = {day for day, eid in data.d_backup_assignments.items() if eid == emp_id}

    issues = []
    for week in data.weeks:
        if len(week) < 5:
            continue
        designated_in_week = 0
        free = 0
        for d in week:
            day = d + 1
            if day in designated:
                designated_in_week += 1
                continue
            if day in special or day in backup_days:
                continue
            free += 1
        need = 2 - designated_in_week
        if need > free:
            issues.append({
                "days": [d + 1 for d in week],
                "shortage": need - free,
            })
    return issues


def diagnose_detailed(data):
    """Return structured diagnostics: {likely_causes, constraint_analysis}."""
    causes = []
    idx = data.emp_index()
    a_capable = [e for e in data.employees if "A" in e.available_shifts and e.role != "night"]
    c_capable = [e for e in data.employees if "C" in e.available_shifts and e.role != "night"]
    non_night = [e for e in data.employees if e.role != "night"]

    if len(a_capable) < 1:
        causes.append(_cause("coverage_gap", "critical",
            "無員工可上 A 班，每日 A 班覆蓋不可能",
            "新增可上 A 班的一般員工"))
    if len(c_capable) < 1:
        causes.append(_cause("coverage_gap", "critical",
            "無員工可上 C 班，每日 C 班覆蓋不可能",
            "新增可上 C 班的員工（一般或 C+D 備援）"))

    # capacity: non-night work slots per week <= 35 (5/day * 7); each works 5/week
    max_non_night = 7
    if len(non_night) > max_non_night:
        causes.append(_cause("over_capacity", "critical",
            f"非大夜員工 {len(non_night)} 人，超過每日上班上限（A2+B1+C2=5/天，每週最多約 {max_non_night} 人可行）",
            "減少員工人數或放寬班次覆蓋上限"))

    for emp in data.employees:
        days = data.designated_off_days.get(emp.id, [])
        if len(days) > 2:
            causes.append(_cause("designated_over_limit", "warning",
                f"{emp.name} 指定休假 {len(days)} 天（每月最多 2 天）",
                f"將指定休假減至 2 天：{days}"))

    # H3 weekend-off conflict: too many weekday leaves force weekend rest
    for emp in data.employees:
        mandatory = _mandatory_weekend_off(data, emp.id)
        if mandatory > 2:
            causes.append(_cause("leave_weekend_conflict", "critical",
                f"{emp.name} 平日請假過多，被迫週末休假 {mandatory} 天（H3 週六+週日加總最多 2 天）",
                "減少平日請假，或將部分請假改到週末/特休"))

    # H2 weekly-off shortage: special leave covering a whole week leaves no OFF
    for emp in data.employees:
        if emp.role == "night":
            continue
        for issue in _weekly_off_shortage(data, emp.id):
            days = issue["days"]
            first, last = days[0], days[-1]
            causes.append(_cause("weekly_off_shortage", "critical",
                f"{emp.name} 特休涵蓋 {data.month}/{first}~{data.month}/{last} 整個完整週，該週無足夠天數排一般休（H2 每週需 2 天，特休不計入）",
                "將該週其中 2 天改為指定休假（即可連休），或把部分特休挪到其他週"))

    for day, emp_id in data.d_backup_assignments.items():
        i = idx.get(emp_id)
        if i is None:
            causes.append(_cause("d_backup_gap", "critical",
                f"{day} 號備援日指派員工不存在", "重新指派備援人員"))
            continue
        candidates = [e for e in data.employees if e.id != emp_id and "C" in e.available_shifts and e.role != "night"]
        fixed = [e.name for e in candidates if day in data.special_leaves.get(e.id, []) or day in data.designated_off_days.get(e.id, [])]
        if len(candidates) - len(fixed) < 1:
            causes.append(_cause("d_backup_gap", "critical",
                f"{day} 號備援日無其他員工可遞補 C 班（可上 C 者：{[e.name for e in candidates]}，當天固定休：{fixed}）",
                "調整該日其他人的休假，或增加可上 C 班的員工"))

    for emp in data.employees:
        prev = data.previous_month.get(emp.id)
        if not prev:
            continue
        prev_day1 = prev[-1]
        forced = []
        if day_in(emp.id, 1, data.designated_off_days):
            forced.append("OFF")
        if day_in(emp.id, 1, data.special_leaves):
            forced.append("SPECIAL")
        if emp.role == "cd_backup" and data.d_backup_assignments.get(1) == emp.id:
            forced.append("D")
        if not forced:
            continue
        if prev_day1 == "C" and "A" in forced:
            causes.append(_cause("cross_month_conflict", "critical",
                f"{emp.name} 上月末 C 班，本月 1 號固定為 {forced}（與 C→A 禁止衝突）",
                "調整上月末班次或本月 1 號的固定休假"))
        if prev_day1 == "D" and ("A" in forced or "C" in forced):
            causes.append(_cause("cross_month_conflict", "critical",
                f"{emp.name} 上月末 D 班，本月 1 號固定為 {forced}（與 D→A/D→C 禁止衝突）",
                "調整上月末班次或本月 1 號的固定休假"))

    # night violations
    night_partial = {}
    for emp in data.employees:
        if emp.role != "night":
            continue
        nights = data.night_schedule.get(emp.id, {})
        night_partial[emp.id] = [nights.get(d + 1, "OFF") for d in range(data.num_days)]
    if night_partial:
        import dataclasses
        from app.scheduler import validator
        night_data = dataclasses.replace(data, employees=[e for e in data.employees if e.role == "night"])
        for v in validator.validate(night_data, night_partial):
            if v["rule"] in ("H2", "H3", "H4", "H12"):
                causes.append(_cause("night_violation", "warning",
                    f"大夜 {v['message']}", "至大夜班表頁面調整大夜班次"))

    if not causes:
        causes.append(_cause("unknown", "warning",
            "無法自動定位衝突原因，請檢查約束組合",
            "嘗試放寬指定休假/特休/備援指示後重新求解"))

    return {
        "likely_causes": causes,
        "constraint_analysis": {
            "employee_count": len(data.employees),
            "non_night_count": len(non_night),
            "a_capable": len(a_capable),
            "c_capable": len(c_capable),
            "night_count": len([e for e in data.employees if e.role == "night"]),
            "cd_backup_count": len([e for e in data.employees if e.role == "cd_backup"]),
        },
    }


def _cause(ctype, severity, message, suggestion):
    return {
        "type": ctype,
        "severity": severity,
        "message": message,
        "suggestion": suggestion,
    }
