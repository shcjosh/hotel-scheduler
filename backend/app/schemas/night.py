from pydantic import BaseModel, Field


class NightEntryRequest(BaseModel):
    employee_id: int
    shift: str = Field(pattern="^(D|OFF)$")


class NightDeleteRequest(BaseModel):
    employee_id: int


class NightEmployee(BaseModel):
    id: int
    name: str


class BackupRequestData(BaseModel):
    id: int
    year: int
    month: int
    day: int
    status: str
    assigned_employee_id: int | None


class NightScheduleResponse(BaseModel):
    night_schedule: dict[str, dict[str, str]]
    night_employees: list[NightEmployee]
    d_backup_requests: list[BackupRequestData]


class BackupRequestRequest(BaseModel):
    year: int
    month: int
    day: int


class BackupRequestResponse(BaseModel):
    id: int
    year: int
    month: int
    day: int
    status: str
    assigned_employee_id: int | None


class NightValidationResponse(BaseModel):
    violations: list[dict]
