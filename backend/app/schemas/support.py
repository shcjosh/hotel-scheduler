from pydantic import BaseModel, Field


class SupportRequestCreate(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=0, le=31)
    shift: str = Field(pattern="^(A|C)$")
    reason: str | None = None


class SupportRequestUpdate(BaseModel):
    status: str = Field(pattern="^(open|resolved|ignored)$")
    resolution: str | None = None


class SupportRequestResponse(BaseModel):
    id: int
    year: int
    month: int
    day: int
    shift: str
    reason: str | None
    status: str
    resolution: str | None
    source: str
    created_at: str
    resolved_at: str | None
