from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["general", "night", "cd_backup", "manager"]
Shift = Literal["A", "B", "C", "D", "M"]
SchedulingMode = Literal["auto", "manual"]

ROLES = ("general", "night", "cd_backup", "manager")
SHIFTS = ("A", "B", "C", "D", "M")

ROLE_DEFAULTS: dict[str, dict] = {
    "general": {
        "available_shifts": ["A", "B", "C"],
        "preferred_shift": None,
        "scheduling_mode": "auto",
    },
    "night": {
        "available_shifts": ["D"],
        "preferred_shift": "D",
        "scheduling_mode": "manual",
    },
    "cd_backup": {
        "available_shifts": ["C", "D"],
        "preferred_shift": "C",
        "scheduling_mode": "auto",
    },
    "manager": {
        "available_shifts": ["M", "A", "B", "C", "D"],
        "preferred_shift": "M",
        "scheduling_mode": "auto",
    },
}


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    role: Role
    available_shifts: list[Shift] | None = None
    preferred_shift: Shift | None = None
    scheduling_mode: SchedulingMode | None = None

    @field_validator("available_shifts")
    @classmethod
    def _validate_shifts(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if len(v) == 0:
            raise ValueError("available_shifts must not be empty")
        if len(set(v)) != len(v):
            raise ValueError("available_shifts must not contain duplicates")
        return v

    @field_validator("preferred_shift")
    @classmethod
    def _validate_preferred(cls, v: str | None) -> str | None:
        return v


class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    role: Role | None = None
    available_shifts: list[Shift] | None = None
    preferred_shift: Shift | None = None
    scheduling_mode: SchedulingMode | None = None
    is_active: int | None = Field(default=None, ge=0, le=1)

    @field_validator("available_shifts")
    @classmethod
    def _validate_shifts(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if len(v) == 0:
            raise ValueError("available_shifts must not be empty")
        if len(set(v)) != len(v):
            raise ValueError("available_shifts must not contain duplicates")
        return v


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    role: str
    available_shifts: list[str]
    preferred_shift: str | None
    scheduling_mode: str
    is_active: int
    created_at: str
    updated_at: str
