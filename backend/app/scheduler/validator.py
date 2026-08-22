from app.scheduler.constraints.hard import (
    ALL_SHIFTS,
    COVERAGE_BACKUP_SHIFTS,
    REST_SHIFTS,
    WORK_SHIFTS,
)
from app.scheduler.off_count import count_off_blocks


def _shift_at(schedule, emp_id, day_idx):
    row = schedule.get(emp_id)
    if row is None or day_idx >= len(row):
        return None
    return row[day_idx]


def _is_rest(s):
    return s in REST_SHIFTS


def _is_work(s):
    return s in WORK_SHIFTS


def _ignored_night(data, emp):
    return emp.role == "night" and emp.id in getattr(data, "night_ignore_all", set())


def _v(rule, emp, day, message):
    return {
        "rule": rule,
        "employee_id": emp.id if emp is not None else None,
        "employee_name": emp.name if emp is not None else None,
        "day": day,
        "message": message,
    }


def validate(data, schedule):
    """schedule: {emp_id: [shift per day_idx]}. Returns structured violations."""
    violations = []
    n = len(data.employees)

    for d in range(data.num_days):
        counts = {s: 0 for s in ALL_SHIFTS}
        for emp in data.employees:
            if _ignored_night(data, emp):
                continue
            s = _shift_at(schedule, emp.id, d)
            if s in counts:
                counts[s] += 1
        if counts["A"] < 1 and not data.is_external(d + 1, "A"):
            violations.append(_v("H1", None, d + 1, f"{data.month}/{d+1} A 班無人"))
        if counts["A"] > 2:
            violations.append(_v("H1", None, d + 1, f"{data.month}/{d+1} A 班超過 2 人"))
        if counts["C"] < 1 and not data.is_external(d + 1, "C"):
            violations.append(_v("H1", None, d + 1, f"{data.month}/{d+1} C 班無人"))
        if counts["C"] > 2:
            violations.append(_v("H1", None, d + 1, f"{data.month}/{d+1} C 班超過 2 人"))
        if counts["B"] > 1:
            violations.append(_v("H1", None, d + 1, f"{data.month}/{d+1} B 班超過 1 人"))
        if counts["D"] > 1:
            violations.append(_v("H1", None, d + 1, f"{data.month}/{d+1} D 班超過 1 人"))

    prev_cache = {}
    for emp in data.employees:
        prev_cache[emp.id] = data.previous_month.get(emp.id)

    for w_i, w in enumerate(data.weeks):
        for emp in data.employees:
            if _ignored_night(data, emp):
                continue
            curr_off = sum(1 for d in w if _shift_at(schedule, emp.id, d) == "OFF")
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
                        violations.append(_v("H9", emp, None, f"跨月週休假共 {total} 天（應為 2）"))
                else:
                    if len(w) >= 5 and curr_off != 2:
                        violations.append(_v("H2", emp, None, f"第 {w_i+1} 週休 {curr_off} 天（應為 2）"))
                    if len(w) < 5 and curr_off > 2:
                        violations.append(_v("H2", emp, None, f"不完整週休 {curr_off} 天（應 <=2）"))
            else:
                if len(w) >= 5 and curr_off != 2:
                    violations.append(_v("H2", emp, None, f"第 {w_i+1} 週休 {curr_off} 天（應為 2）"))
                if len(w) < 5 and curr_off > 2:
                    violations.append(_v("H2", emp, None, f"不完整週休 {curr_off} 天（應 <=2）"))

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        sat_off = sum(1 for d in data.saturdays if _shift_at(schedule, emp.id, d) == "OFF")
        sun_off = sum(1 for d in data.sundays if _shift_at(schedule, emp.id, d) == "OFF")
        if sat_off + sun_off > 2:
            violations.append(_v("H3", emp, None, f"週末休假 {sat_off + sun_off} 天（應 <=2）"))

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
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
                real_start = start + 1 if start >= 0 else start
                violations.append(_v("H4", emp, real_start, "連續 6 天上班（含跨月）"))

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        shifts = schedule.get(emp.id, [])
        for d in range(data.num_days - 1):
            cur = shifts[d] if d < len(shifts) else None
            nxt = shifts[d + 1] if d + 1 < len(shifts) else None
            if cur == "C" and nxt == "A":
                violations.append(_v("H5", emp, d + 1, f"{d+1}→{d+2} C→A 禁止"))
            if cur == "D" and nxt == "A":
                violations.append(_v("H5", emp, d + 1, f"{d+1}→{d+2} D→A 禁止"))
            if cur == "D" and nxt == "C":
                violations.append(_v("H5", emp, d + 1, f"{d+1}→{d+2} D→C 禁止"))
            if cur == "D" and nxt == "M":
                violations.append(_v("H5", emp, d + 1, f"{d+1}→{d+2} D→M 禁止"))

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        for day in data.designated_off_days.get(emp.id, []):
            if _shift_at(schedule, emp.id, day - 1) != "OFF":
                violations.append(_v("H6", emp, day, "應為指定休假"))

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        avail = set(emp.available_shifts)
        for d in range(data.num_days):
            s = _shift_at(schedule, emp.id, d)
            if s is None or s == "OFF" or s == "SPECIAL":
                continue
            if s not in avail:
                violations.append(_v("H7", emp, d + 1, f"排 {s} 不在可用班次"))

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        shifts = schedule.get(emp.id, [])
        prev = prev_cache[emp.id]
        prev_day1 = prev[-1] if prev else None
        cur0 = shifts[0] if shifts else None
        if prev_day1 == "C" and cur0 == "A":
            violations.append(_v("H8", emp, 1, "上月末 C→本月首 A"))
        if prev_day1 == "D" and cur0 == "A":
            violations.append(_v("H8", emp, 1, "上月末 D→本月首 A"))
        if prev_day1 == "D" and cur0 == "C":
            violations.append(_v("H8", emp, 1, "上月末 D→本月首 C"))
        if prev_day1 == "D" and cur0 == "M":
            violations.append(_v("H8", emp, 1, "上月末 D→本月首 M"))

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        shifts = schedule.get(emp.id, [])
        for d in range(data.num_days):
            s = shifts[d] if d < len(shifts) else None
            if s is not None and s not in ALL_SHIFTS:
                violations.append(_v("H10", emp, d + 1, f"未知班次 {s}"))

    for day, emp_id in data.d_backup_assignments.items():
        i = data.emp_index().get(emp_id)
        if i is None:
            continue
        emp = data.employees[i]
        if _shift_at(schedule, emp_id, day - 1) != "D":
            violations.append(_v("H11", emp, day, "備援日應排 D"))
        c_count = sum(
            1 for other in data.employees
            if other.id != emp_id and _shift_at(schedule, other.id, day - 1) == "C"
        )
        if c_count < 1:
            violations.append(_v("H11", None, day, f"{day} 號備援日無人遞補 C 班"))

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        shifts = schedule.get(emp.id, [])
        row = [shifts[d] if d < len(shifts) else None for d in range(data.num_days)]
        runs, _ = count_off_blocks(row)
        if runs < 1 or runs > 2:
            violations.append(_v("H12", emp, None, f"連休 {runs} 次（應為 1~2 次）"))

    for emp in data.employees:
        if emp.role != "night":
            continue
        if _ignored_night(data, emp):
            continue
        nights = data.night_schedule.get(emp.id, {})
        for d in range(data.num_days):
            expected = nights.get(d + 1, "OFF")
            actual = _shift_at(schedule, emp.id, d)
            if actual != expected:
                violations.append(_v("H13", emp, d + 1, f"大夜應為 {expected} 實為 {actual}"))

    return violations


def _prev_day1(data, emp_id):
    prev = data.previous_month.get(emp_id)
    return prev[-1] if prev else None


def validate_soft(data, schedule):
    """Returns soft warnings (S1-S3, S7-S10). S5/S6 computed separately by caller."""
    warnings = []
    backup_days = set(data.d_backup_requests)

    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        shifts = schedule.get(emp.id, [])
        prev_day1 = _prev_day1(data, emp.id)

        # S1: avoid 5 consecutive work
        for d in range(data.num_days - 4):
            window = [shifts[d + i] if d + i < len(shifts) else None for i in range(5)]
            if None in window:
                continue
            if all(_is_work(s) for s in window):
                warnings.append(_v("S1", emp, d + 1, "連續 5 天上班"))

        # S2/S3: transitions (curr) + cross-month
        def check_transition(cur, nxt, day):
            if cur == "B" and nxt == "A":
                warnings.append(_v("S2", emp, day, "B→A 盡量避免"))
            if cur == "C" and nxt == "B":
                warnings.append(_v("S3", emp, day, "C→B 盡量避免"))

        for d in range(data.num_days - 1):
            cur = shifts[d] if d < len(shifts) else None
            nxt = shifts[d + 1] if d + 1 < len(shifts) else None
            if cur is None or nxt is None:
                continue
            check_transition(cur, nxt, d + 1)

        cur0 = shifts[0] if shifts else None
        if prev_day1 is not None and cur0 is not None:
            check_transition(prev_day1, cur0, 1)

        # S7: cd_backup non-backup D
        if emp.role == "cd_backup":
            for d in range(data.num_days):
                if (d + 1) in backup_days:
                    continue
                s = _shift_at(schedule, emp.id, d)
                if s == "D":
                    warnings.append(_v("S7", emp, d + 1, "非備援日排 D"))

    # S8: manager on A/B/C/D (backup) — warn per occurrence
    for emp in data.employees:
        if emp.role != "manager":
            continue
        for d in range(data.num_days):
            s = _shift_at(schedule, emp.id, d)
            if s in COVERAGE_BACKUP_SHIFTS:
                warnings.append(_v("S8", emp, d + 1, f"管理職備援排 {s}（建議上 M 班）"))

    # S9: 連休 2 次優先 — 僅 1 次連休者（建議 2 次）
    for emp in data.employees:
        if _ignored_night(data, emp):
            continue
        shifts = schedule.get(emp.id, [])
        row = [shifts[d] if d < len(shifts) else None for d in range(data.num_days)]
        runs, _ = count_off_blocks(row)
        if runs < 2:
            warnings.append(_v("S9", emp, None, f"連休 {runs} 次（建議 2 次）"))

    # S10: 週五/週六人力加強（雙A/雙C）＋ 平日（週日~週四）優先排 B
    fri_sat = set(data.fridays) | set(data.saturdays)
    for d in sorted(fri_sat):
        a = sum(1 for emp in data.employees if _shift_at(schedule, emp.id, d) == "A")
        c = sum(1 for emp in data.employees if _shift_at(schedule, emp.id, d) == "C")
        if a < 2 and c < 2:
            warnings.append(_v("S10", None, d + 1, "週五/六人力未加強（建議雙 A 或雙 C）"))
    for d in range(data.num_days):
        if d in fri_sat:
            continue
        b = sum(1 for emp in data.employees if _shift_at(schedule, emp.id, d) == "B")
        if b == 0:
            warnings.append(_v("S10", None, d + 1, "平日未排 B（建議排 B）"))

    return warnings


def count_preferred_unsatisfied(data, schedule) -> int:
    count = 0
    for emp in data.employees:
        if not emp.preferred_shift:
            continue
        for d in range(data.num_days):
            s = _shift_at(schedule, emp.id, d)
            if s is None or s in ("OFF", "SPECIAL"):
                continue
            if s != emp.preferred_shift:
                count += 1
    return count


def compute_fairness_spread(data, schedule) -> int:
    totals = []
    for emp in data.employees:
        shifts = schedule.get(emp.id, [])
        totals.append(sum(1 for s in shifts if _is_work(s)))
    if not totals:
        return 0
    return max(totals) - min(totals)


RULE_DESCRIPTIONS = {
    "H1": "每日班次覆蓋", "H2": "每週休 2 天", "H3": "週末休假限制（六+日<=2）",
    "H4": "連續上班上限", "H5": "班次銜接禁止", "H6": "指定休假",
    "H7": "可用班次限制", "H8": "跨月班次銜接", "H9": "跨月週連續性",
    "H10": "一天一班", "H11": "D 班備援邏輯", "H12": "連休 1~2 次",
    "H13": "大夜專職手動",
    "S1": "避免連續 5 天上班", "S2": "B→A 盡量避免", "S3": "C→B 盡量避免",
    "S5": "偏好班次", "S6": "公平分配",
    "S7": "D 班備援最小化", "S8": "管理職備援最小化",
    "S9": "連休 2 次優先", "S10": "週五/六雙A/雙C＋平日B",
}
