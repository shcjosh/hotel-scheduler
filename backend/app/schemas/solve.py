from pydantic import BaseModel, Field


class SolveRequest(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    max_solve_time: float = Field(default=30.0, ge=1.0, le=600.0)
    enable_d_backup: bool = True


class SolveResponse(BaseModel):
    success: bool
    schedule: dict[str, list[str]] | None = None
    error: str | None = None
    solve_time: float = 0.0
    violations: list[str] | None = None
    objective_value: float | None = None
    soft_constraint_stats: dict | None = None
    diagnostics: dict | None = None
