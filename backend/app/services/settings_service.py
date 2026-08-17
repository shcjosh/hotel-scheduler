from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import Setting, now_iso

DEFAULTS = {"hotel_name": "清翼居府中館"}


def get_setting(db: Session, key: str) -> str | None:
    rec = db.get(Setting, key)
    return rec.value if rec else None


def set_setting(db: Session, key: str, value: str) -> str:
    rec = db.get(Setting, key)
    if rec is None:
        rec = Setting(key=key, value=value)
        db.add(rec)
    else:
        rec.value = value
        rec.updated_at = now_iso()
    db.commit()
    return value


def get_all_settings(db: Session) -> dict[str, str]:
    result = dict(DEFAULTS)
    for rec in db.scalars(select(Setting)):
        result[rec.key] = rec.value
    return result


def get_hotel_name(db: Session) -> str:
    return get_setting(db, "hotel_name") or DEFAULTS["hotel_name"]


def ensure_defaults(db: Session) -> None:
    for key, value in DEFAULTS.items():
        if db.get(Setting, key) is None:
            db.add(Setting(key=key, value=value))
    db.commit()
