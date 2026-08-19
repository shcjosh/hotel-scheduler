from typing import Literal

from pydantic import BaseModel, ConfigDict


class StatusUpdateRequest(BaseModel):
    status: Literal["draft", "published", "locked"]


class SnapshotCreateRequest(BaseModel):
    name: str | None = None


class SnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    year: int
    month: int
    version_number: str
    name: str
    created_at: str


class ChangeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    year: int
    month: int
    employee_id: int
    day: int
    old_shift: str
    new_shift: str
    reason: str | None
    created_at: str
