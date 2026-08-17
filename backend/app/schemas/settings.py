from pydantic import BaseModel


class SettingResponse(BaseModel):
    key: str
    value: str


class SettingUpdateRequest(BaseModel):
    value: str


class AllSettingsResponse(BaseModel):
    hotel_name: str
