"""特休（特別休假）週年制計算與紀錄。

- **週年制**：以到職日為週期。首段為到職 +6 個月～+1 年（3 天），
  其後為各到職週年日（滿 1 年 7 天、滿 2 年 10 天…，依勞基法 §38，
  滿 10 年起每滿 1 年 +1 日、上限 30 日）。
- **額度**：依到職日自動計算，可於 `annual_leave_adjustments` 逐期覆寫。
- **特 N 編號**：該期間內整天特休（`leave_type='SPECIAL'`）依日期排序累加，
  起算值 = `floor(期初已用天數)`。
- **半天等手動補登**（`annual_leave_manual_entries`）：計入已用，但不影響編號。
"""

import calendar
import math
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import (
    AnnualLeaveAdjustment,
    AnnualLeaveManualEntry,
    Employee,
    SpecialLeave,
    now_iso,
)
from app.services.employee_service import visible_in_month_clause

SPECIAL_CODE = "SPECIAL"


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        y, m, d = (int(x) for x in str(value)[:10].split("-"))
        return date(y, m, d)
    except (ValueError, AttributeError):
        return None


def _add_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    y, m = divmod(total, 12)
    m += 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def _add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # 2/29 到職，非閏年取 2/28
        return d.replace(year=d.year + years, day=28)


def full_years(hire: date, on: date) -> int:
    """hire → on 之間的完整年數。"""
    y = on.year - hire.year
    if (on.month, on.day) < (hire.month, hire.day):
        y -= 1
    return y


def entitlement_years(years: int) -> int:
    """依「滿 N 年」計算特休天數（years=0 → 滿 6 個月的 3 天）。"""
    if years <= 0:
        return 3
    if years == 1:
        return 7
    if years == 2:
        return 10
    if years in (3, 4):
        return 14
    if years <= 9:
        return 15
    return min(15 + (years - 9), 30)


def period_start_for(hire: date, on: date) -> date | None:
    """回傳 on 所屬週年期間首日；尚未滿 6 個月回 None。"""
    six = _add_months(hire, 6)
    if on < six:
        return None
    years = full_years(hire, on)
    if years >= 1:
        return _add_years(hire, years)
    return six


def period_end_for(hire: date, period_start: date) -> date:
    """期間結束日（**不含**）；= 下一期首日。"""
    six = _add_months(hire, 6)
    if period_start == six:
        return _add_years(hire, 1)
    years = full_years(hire, period_start)
    return _add_years(hire, years + 1)


def entitlement_for_period(hire: date, period_start: date) -> int:
    six = _add_months(hire, 6)
    if period_start == six:
        return 3
    return entitlement_years(full_years(hire, period_start))


def periods_overlapping_month(hire: date, year: int, month: int) -> list[date]:
    """回傳與該月份重疊的期間首日（依序）。"""
    num = calendar.monthrange(year, month)[1]
    first = date(year, month, 1)
    last = date(year, month, num)
    start = period_start_for(hire, first)
    if start is None:
        start = _add_months(hire, 6)
    result: list[date] = []
    while start <= last:
        result.append(start)
        start = period_end_for(hire, start)
    return result


def _emp_special_dates(db: Session, emp_id: int) -> list[date]:
    """該員工所有整天特休（leave_type=SPECIAL）日期，依序。"""
    rows = db.scalars(
        select(SpecialLeave).where(
            SpecialLeave.employee_id == emp_id,
            SpecialLeave.leave_type == SPECIAL_CODE,
        )
    )
    dates: list[date] = []
    for r in rows:
        try:
            dates.append(date(r.year, r.month, r.day))
        except ValueError:
            continue
    return sorted(dates)


def _in_range(dates: list[date], start: date, end: date) -> list[date]:
    return [d for d in dates if start <= d < end]


def _manual_all(db: Session, emp_id: int) -> list[AnnualLeaveManualEntry]:
    return list(
        db.scalars(
            select(AnnualLeaveManualEntry).where(
                AnnualLeaveManualEntry.employee_id == emp_id
            )
        )
    )


def _manual_days_in(entries: list[AnnualLeaveManualEntry], start: date, end: date) -> float:
    total = 0.0
    for e in entries:
        d = parse_date(e.entry_date)
        if d is not None and start <= d < end:
            total += float(e.days or 0)
    return total


def _adjustments(db: Session, emp_id: int) -> dict[str, AnnualLeaveAdjustment]:
    return {
        a.period_start: a
        for a in db.scalars(
            select(AnnualLeaveAdjustment).where(
                AnnualLeaveAdjustment.employee_id == emp_id
            )
        )
    }


def employee_periods(db: Session, emp: Employee, year: int, month: int) -> dict | None:
    """該月份重疊的特休期間明細（含額度/已用/剩餘）。"""
    hire = parse_date(emp.hire_date)
    if hire is None:
        return None
    starts = periods_overlapping_month(hire, year, month)
    if not starts:
        return None

    adj = _adjustments(db, emp.id)
    special = _emp_special_dates(db, emp.id)
    manual = _manual_all(db, emp.id)
    num = calendar.monthrange(year, month)[1]
    seniority = full_years(hire, date(year, month, num))

    periods = []
    for start in starts:
        end = period_end_for(hire, start)
        law = entitlement_for_period(hire, start)
        a = adj.get(start.isoformat())
        override = a.entitlement_override if a is not None else None
        entitlement = float(override) if override is not None else float(law)
        opening = float(a.opening_used_days) if a is not None else 0.0
        system_days = len(_in_range(special, start, end))
        manual_days = _manual_days_in(manual, start, end)
        used = system_days + opening + manual_days
        periods.append(
            {
                "period_start": start.isoformat(),
                "period_end": (end - timedelta(days=1)).isoformat(),
                "years": full_years(hire, start) if start != _add_months(hire, 6) else 0,
                "entitlement": entitlement,
                "entitlement_law": float(law),
                "entitlement_override": float(override) if override is not None else None,
                "opening_used_days": opening,
                "system_days": system_days,
                "manual_days": manual_days,
                "used_days": used,
                "remaining": entitlement - used,
                "note": a.note if a is not None else None,
            }
        )
    return {
        "hire_date": emp.hire_date,
        "seniority_years": seniority,
        "periods": periods,
    }


def get_month_summary(db: Session, year: int, month: int) -> dict:
    employees = list(
        db.scalars(
            select(Employee)
            .where(Employee.is_active == 1, visible_in_month_clause(year, month))
            .order_by(Employee.sort_order.asc(), Employee.id.asc())
        )
    )
    out: dict[str, dict] = {}
    for emp in employees:
        info = employee_periods(db, emp, year, month)
        manual = [
            {
                "id": m.id,
                "date": m.entry_date,
                "days": float(m.days or 0),
                "note": m.note,
            }
            for m in _manual_all(db, emp.id)
            if (parse_date(m.entry_date) is not None
                and parse_date(m.entry_date).year == year
                and parse_date(m.entry_date).month == month)
        ]
        if info is None and not manual:
            continue
        out[str(emp.id)] = {
            "hire_date": emp.hire_date,
            "seniority_years": info["seniority_years"] if info else None,
            "periods": info["periods"] if info else [],
            "manual_entries": manual,
        }
    return {"employees": out}


def month_leave_info(
    db: Session, employees: list[Employee], year: int, month: int, num_days: int
) -> dict[str, dict]:
    """排班表用：{員工姓名: {sequence: {day: N}, base: [...]}}。

    sequence：整天特休的「特 N」編號。
    base：該月各週年期間的起始序號（前端畫筆暫存時自行累加用）。
    """
    first = date(year, month, 1)
    last = date(year, month, num_days)
    result: dict[str, dict] = {}
    for emp in employees:
        hire = parse_date(emp.hire_date)
        if hire is None:
            continue
        starts = periods_overlapping_month(hire, year, month)
        if not starts:
            continue
        adj = _adjustments(db, emp.id)
        special = _emp_special_dates(db, emp.id)

        sequence: dict[int, int] = {}
        bases = []
        for start in starts:
            end = period_end_for(hire, start)
            a = adj.get(start.isoformat())
            floor_open = math.floor(float(a.opening_used_days)) if a is not None else 0
            before = len(_in_range(special, start, min(first, end)))
            base = floor_open + before
            bases.append(
                {
                    "period_start": start.isoformat(),
                    "period_end": (end - timedelta(days=1)).isoformat(),
                    "base": base,
                }
            )
            count = base
            for d in _in_range(special, max(start, first), min(end, last + timedelta(days=1))):
                count += 1
                sequence[d.day] = count
        result[emp.name] = {"sequence": sequence, "base": bases}
    return result


def upsert_adjustment(
    db: Session,
    emp_id: int,
    period_start: str,
    opening_used_days: float,
    entitlement_override: float | None,
    note: str | None,
) -> AnnualLeaveAdjustment:
    emp = db.get(Employee, emp_id)
    if emp is None:
        raise ValueError("員工不存在")
    hire = parse_date(emp.hire_date)
    if hire is None:
        raise ValueError("請先設定該員工的到職日")
    ps = parse_date(period_start)
    if ps is None:
        raise ValueError("期間起始日格式須為 YYYY-MM-DD")
    if period_start_for(hire, ps) != ps:
        raise ValueError("期間起始日不是該員工的特休週年期間")
    if opening_used_days is None or opening_used_days < 0:
        raise ValueError("期初已用天數不可為負")
    if entitlement_override is not None and entitlement_override < 0:
        raise ValueError("額度覆寫不可為負")

    rec = db.scalars(
        select(AnnualLeaveAdjustment).where(
            AnnualLeaveAdjustment.employee_id == emp_id,
            AnnualLeaveAdjustment.period_start == ps.isoformat(),
        )
    ).first()
    if rec is None:
        rec = AnnualLeaveAdjustment(
            employee_id=emp_id, period_start=ps.isoformat()
        )
        db.add(rec)
    rec.opening_used_days = float(opening_used_days)
    rec.entitlement_override = (
        float(entitlement_override) if entitlement_override is not None else None
    )
    rec.note = note or None
    rec.updated_at = now_iso()
    db.commit()
    db.refresh(rec)
    return rec


def add_manual_entry(
    db: Session, emp_id: int, entry_date: str, days: float, note: str | None
) -> AnnualLeaveManualEntry:
    if db.get(Employee, emp_id) is None:
        raise ValueError("員工不存在")
    d = parse_date(entry_date)
    if d is None:
        raise ValueError("日期格式須為 YYYY-MM-DD")
    if days is None or days <= 0:
        raise ValueError("天數須大於 0")
    rec = AnnualLeaveManualEntry(
        employee_id=emp_id, entry_date=d.isoformat(), days=float(days), note=note or None
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def delete_manual_entry(db: Session, entry_id: int) -> None:
    rec = db.get(AnnualLeaveManualEntry, entry_id)
    if rec is None:
        raise ValueError("紀錄不存在")
    db.delete(rec)
    db.commit()
