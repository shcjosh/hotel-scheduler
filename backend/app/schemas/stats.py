from pydantic import BaseModel


class EmployeeStats(BaseModel):
    employee_id: int
    employee_name: str
    role: str
    shift_counts: dict[str, int]
    total_work_days: int
    total_off_days: int
    total_special_days: int
    weekend_work_count: int
    max_consecutive_work: int
    consecutive_off_count: int
    preferred_satisfied: int


class ShiftStats(BaseModel):
    total: int
    per_day_avg: float
    min: int
    max: int


class DailyCoverageStats(BaseModel):
    day: int
    weekday: int
    A: int
    B: int
    C: int
    D: int
    M: int
    total: int


class MonthSummary(BaseModel):
    year: int
    month: int
    num_days: int
    total_shifts: int
    solve_status: str
    objective_value: float | None
    solve_time: float | None


class MonthStatsResponse(BaseModel):
    month_summary: MonthSummary
    per_employee: list[EmployeeStats]
    per_shift: dict[str, ShiftStats]
    daily_coverage: list[DailyCoverageStats]
    weekend_summary: dict
    violations_summary: dict
    soft_constraint_stats: dict | None
