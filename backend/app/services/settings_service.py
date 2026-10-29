from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import Setting, now_iso

PRINT_NOTES_DEFAULT = (
    "需要連續休三天以上，請提前2個月跟店長溝通。\n"
    "＊請於當月月會過後安排次月班表，櫃台五人上班時，平日可排休2人；"
    "周五、周六及週日限休1人。四人上班時，原則每日限休1人，並於25日前排定。\n"
    "＊連續排班最多五日，不可超過。\n"
    "＊如需調班(請假)請填寫調班單(假單)，並經主館核准。"
    "如遇突發狀況無法準時到班，請電聯主管以便調度。"
)

DEFAULTS = {
    "hotel_name": "清翼居府中館",
    "user_name": "Josh Wang",
    # PDF 抬頭第二行（例：板橋府中店(一館)）；留空則不顯示
    "branch_name": "",
    # PDF 頁尾注意事項；可在列印預覽直接修改
    "print_notes": PRINT_NOTES_DEFAULT,
}


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
