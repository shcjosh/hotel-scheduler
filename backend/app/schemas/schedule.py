from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ShiftCode = Literal["A", "B", "C", "D", "OFF", "SPECIAL"]
Source = Literal["auto", "manual", "night_input", "backup", "designated", "special"]

SHIFT_CODES = ("A", "B", "C", "D", "OFF", "SPECIAL")
SOURCES = ("auto", "manual", "night_input", "backup", "designated", "special")


class ScheduleEntryCreate(BaseModel):
    employee_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    shift: ShiftCode
    source: Source = "manual"


class ScheduleEntryUpdate(BaseModel):
    shift: ShiftCode | None = None
    source: Source | None = None


class ScheduleEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    year: int
    month: int
    day: int
    shift: str
    source: str
    created_at: str
    updated_at: str


class MonthScheduleView(BaseModel):
    year: int
    month: int
    num_days: int
    schedule: dict[str, list[str]]
    sources: dict[str, list[str]] = {}
    leave_details: dict[str, dict[int, str]] = {}
    status: str = "draft"


class CellUpdateRequest(BaseModel):
    shift: str
    leave_type: str | None = None
    reason: str | None = None


class ValidateCellRequest(BaseModel):
    employee_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    new_shift: str


class CellViolation(BaseModel):
    rule: str
    severity: str
    message: str


class ValidateCellResponse(BaseModel):
    violations: list[CellViolation]
    warnings: list[CellViolation]


class RuleStat(BaseModel):
    violations: int
    description: str


class ValidationSummary(BaseModel):
    total_violations: int
    hard_violations: int
    soft_warnings: int
    is_valid: bool


class ScheduleValidationResponse(BaseModel):
    summary: ValidationSummary
    violations: list[dict]
    warnings: list[dict]
    per_rule_summary: dict[str, RuleStat]
