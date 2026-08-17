from pydantic import BaseModel, Field


class CrossMonthLinkData(BaseModel):
    employee_id: int
    day_5_shift: str | None = None
    day_4_shift: str | None = None
    day_3_shift: str | None = None
    day_2_shift: str | None = None
    day_1_shift: str | None = None
    source: str = "manual"


class CrossMonthResponse(BaseModel):
    previous_month_links: dict[str, CrossMonthLinkData]
    prev_month_name: str
    prev_last_5_dates: list[str]


class CrossMonthLinkInput(BaseModel):
    employee_id: int
    day_5_shift: str | None = None
    day_4_shift: str | None = None
    day_3_shift: str | None = None
    day_2_shift: str | None = None
    day_1_shift: str | None = None


class CrossMonthSaveRequest(BaseModel):
    links: list[CrossMonthLinkInput] = Field(default_factory=list)


class CrossMonthViolation(BaseModel):
    employee_id: int
    employee_name: str
    type: str
    rule: str
    message: str


class CrossMonthWeekSummary(BaseModel):
    employee_id: int
    employee_name: str
    prev_week_off_count: int
    curr_week_off_count: int | None
    remaining_off: int
    at_limit: bool


class CrossMonthPreviewResponse(BaseModel):
    violations: list[CrossMonthViolation]
    cross_month_week_summary: list[CrossMonthWeekSummary]
