from pydantic import BaseModel, ConfigDict, Field


class OffDayRequest(BaseModel):
    employee_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    leave_type: str = "SPECIAL"


class OffDayResponse(BaseModel):
    designated_off_days: dict[str, list[int]]
    special_leaves: dict[str, list[int]]
    leave_details: dict[str, dict[str, str]] = {}


class EmployeeOffSummary(BaseModel):
    consecutive_off_count: int
    consecutive_off_days: list[int]
    designated_count: int
    special_count: int
    leave_type_counts: dict[str, int] = {}
    total_leave_days: int = 0


OffDaySummaryResponse = dict[str, EmployeeOffSummary]


class LeaveTypeCreate(BaseModel):
    name: str
    color_bg: str
    color_text: str


class LeaveTypeUpdate(BaseModel):
    name: str | None = None
    color_bg: str | None = None
    color_text: str | None = None


class LeaveTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    color_bg: str
    color_text: str
    is_builtin: int
    is_active: int
