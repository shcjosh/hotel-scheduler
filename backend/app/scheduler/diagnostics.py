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
        for code, msg in viols:
            if code in ("H2", "H3", "H4", "H12"):
                issues.append(f"H13(大夜): {msg}")

    return issues


def day_in(emp_id, day, mapping):
    return day in mapping.get(emp_id, [])
