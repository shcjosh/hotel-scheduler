from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Index, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        Index("idx_employee_name", "name"),
        Index("idx_employee_role", "role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    nickname: Mapped[str | None] = mapped_column(Text, nullable=True)
    tag: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    available_shifts: Mapped[str] = mapped_column(Text, nullable=False)
    preferred_shift: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduling_mode: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)


class ScheduleEntry(Base):
    __tablename__ = "schedule_entries"
    __table_args__ = (
        UniqueConstraint(
            "employee_id", "year", "month", "day", name="uq_schedule_entry"
        ),
        Index("idx_schedule_ym", "year", "month"),
        Index("idx_schedule_emp_ym", "employee_id", "year", "month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    shift: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)

    employee: Mapped["Employee"] = relationship()


class DesignatedOffDay(Base):
    __tablename__ = "designated_off_days"
    __table_args__ = (
        UniqueConstraint(
            "employee_id", "year", "month", "day", name="uq_designated_off_day"
        ),
        Index("idx_designated_ym", "year", "month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)

    employee: Mapped["Employee"] = relationship()


class SpecialLeave(Base):
    __tablename__ = "special_leaves"
    __table_args__ = (
        UniqueConstraint(
            "employee_id", "year", "month", "day", name="uq_special_leave"
        ),
        Index("idx_special_ym", "year", "month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    leave_type: Mapped[str] = mapped_column(Text, nullable=False, default="SPECIAL")
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)

    employee: Mapped["Employee"] = relationship()


class LeaveType(Base):
    __tablename__ = "leave_types"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    color_bg: Mapped[str] = mapped_column(Text, nullable=False)
    color_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_builtin: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)


class ScheduleStatus(Base):
    __tablename__ = "schedule_statuses"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    month: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft")
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)


class ScheduleSnapshot(Base):
    __tablename__ = "schedule_snapshots"
    __table_args__ = (Index("idx_snapshot_ym", "year", "month"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    version_number: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    schedule_data: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)


class ScheduleChangeLog(Base):
    __tablename__ = "schedule_change_logs"
    __table_args__ = (Index("idx_changelog_ym", "year", "month"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    old_shift: Mapped[str] = mapped_column(Text, nullable=False)
    new_shift: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)

    employee: Mapped["Employee"] = relationship()


class DBackupRequest(Base):
    __tablename__ = "d_backup_requests"
    __table_args__ = (
        UniqueConstraint("year", "month", "day", name="uq_d_backup_request"),
        Index("idx_backup_ym", "year", "month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)


class PreviousMonthLink(Base):
    __tablename__ = "previous_month_links"
    __table_args__ = (
        UniqueConstraint("employee_id", "year", "month", name="uq_previous_month_link"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    day_5_shift: Mapped[str | None] = mapped_column(Text, nullable=True)
    day_4_shift: Mapped[str | None] = mapped_column(Text, nullable=True)
    day_3_shift: Mapped[str | None] = mapped_column(Text, nullable=True)
    day_2_shift: Mapped[str | None] = mapped_column(Text, nullable=True)
    day_1_shift: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="auto")
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)

    employee: Mapped["Employee"] = relationship()


class NightRuleOverride(Base):
    __tablename__ = "night_rule_overrides"
    __table_args__ = (
        UniqueConstraint("employee_id", "rule_name", name="uq_night_rule_override"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    rule_name: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)


class SupportRequest(Base):
    __tablename__ = "support_requests"
    __table_args__ = (
        UniqueConstraint("year", "month", "day", "shift", name="uq_support_request"),
        Index("idx_support_ym", "year", "month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    shift: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="open")
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="manual")
    created_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)
    resolved_at: Mapped[str | None] = mapped_column(Text, nullable=True)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, default=now_iso)
