from pydantic import BaseModel, Field


class AdjustmentUpsertRequest(BaseModel):
    employee_id: int
    period_start: str
    opening_used_days: float = 0
    entitlement_override: float | None = None
    note: str | None = None


class ManualEntryCreateRequest(BaseModel):
    employee_id: int
    date: str
    days: float = Field(default=0.5, gt=0)
    note: str | None = None
