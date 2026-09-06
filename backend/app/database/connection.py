from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATA_DIR, DATABASE_URL


class Base(DeclarativeBase):
    pass


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def _run_migrations() -> None:
    """新增欄位給既有 DB（create_all 只建新表，不會改舊表結構）。"""
    with engine.begin() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(special_leaves)")}
        if cols and "leave_type" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE special_leaves ADD COLUMN leave_type TEXT NOT NULL DEFAULT 'SPECIAL'"
            )
        emp_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(employees)")}
        if emp_cols and "nickname" not in emp_cols:
            conn.exec_driver_sql(
                "ALTER TABLE employees ADD COLUMN nickname TEXT"
            )
        if emp_cols and "sort_order" not in emp_cols:
            conn.exec_driver_sql(
                "ALTER TABLE employees ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
            )
        if emp_cols and "tag" not in emp_cols:
            conn.exec_driver_sql(
                "ALTER TABLE employees ADD COLUMN tag TEXT"
            )


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    from app.database import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _run_migrations()

    from app.services.leave_type_service import ensure_defaults as ensure_leave_types
    from app.services.settings_service import ensure_defaults
    from app.database.connection import SessionLocal
    s = SessionLocal()
    try:
        ensure_defaults(s)
        ensure_leave_types(s)
    finally:
        s.close()
