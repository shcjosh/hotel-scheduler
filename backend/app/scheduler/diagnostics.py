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

    # capacity: non-night work slots per week <= 42 (6/day * 7); each works 5/week
    max_non_night = 8
    if len(non_night) > max_non_night:
        causes.append(_cause("over_capacity", "critical",
            f"非大夜員工 {len(non_night)} 人，超過每日上班上限（A2+B2+C2=6/天，每週最多約 {max_non_night} 人可行）",
            "減少員工人數或放寬班次覆蓋上限"))

    for emp in data.employees:
        days = data.designated_off_days.get(emp.id, [])
        if len(days) > 2:
            causes.append(_cause("designated_over_limit", "warning",
                f"{emp.name} 指定休假 {len(days)} 天（每月最多 2 天）",
                f"將指定休假減至 2 天：{days}"))

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
