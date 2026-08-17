from pydantic import BaseModel, Field


class OffDayRequest(BaseModel):
    employee_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)


class OffDayResponse(BaseModel):
    designated_off_days: dict[str, list[int]]
    special_leaves: dict[str, list[int]]


class EmployeeOffSummary(BaseModel):
    consecutive_off_count: int
    consecutive_off_days: list[int]
    designated_count: int
    special_count: int


OffDaySummaryResponse = dict[str, EmployeeOffSummary]
