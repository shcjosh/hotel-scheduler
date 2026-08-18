from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.settings import AllSettingsResponse, SettingResponse, SettingUpdateRequest
from app.services import settings_service

router = APIRouter()


@router.get("/settings", response_model=AllSettingsResponse)
def get_all_settings(db: Session = Depends(get_db)):
    s = settings_service.get_all_settings(db)
    return AllSettingsResponse(
        hotel_name=s.get("hotel_name", "清翼居府中館"),
        user_name=s.get("user_name", "Josh Wang"),
    )


@router.get("/settings/{key}", response_model=SettingResponse)
def get_setting(key: str, db: Session = Depends(get_db)):
    value = settings_service.get_setting(db, key)
    if value is None:
        value = settings_service.DEFAULTS.get(key, "")
    return SettingResponse(key=key, value=value)


@router.put("/settings/{key}", response_model=SettingResponse)
def update_setting(
    key: str, req: SettingUpdateRequest, db: Session = Depends(get_db)
):
    value = settings_service.set_setting(db, key, req.value)
    return SettingResponse(key=key, value=value)
