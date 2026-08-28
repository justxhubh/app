from typing import Literal

from pydantic import BaseModel, Field


class SendOtpBody(BaseModel):
    phone: str = Field(pattern=r"^[6-9]\d{9}$")


class VerifyOtpBody(BaseModel):
    phone: str
    otp: str


class RefreshBody(BaseModel):
    refreshToken: str


class CheckInBody(BaseModel):
    memberId: str
    source: Literal["QR", "MANUAL", "OFFLINE"] = "QR"
    qrPayload: str = ""


class UpdateMemberBody(BaseModel):
    status: str | None = None
    name: str | None = None
    phone: str | None = None


class RenewBody(BaseModel):
    days: int | None = None


class RemindBody(BaseModel):
    channel: str | None = None


class ServiceBody(BaseModel):
    name: str = Field(min_length=3)
    category: Literal["PT", "DIET", "SUPPLEMENT"]
    price: float = Field(gt=0)


class SaleBody(BaseModel):
    memberId: str
    serviceId: str


class ReadNotificationBody(BaseModel):
    id: str


class RiskThresholdsBody(BaseModel):
    activeMax: int = Field(ge=0)
    watchMax: int = Field(ge=0)
    atRiskMax: int = Field(ge=0)


class SettingsBody(BaseModel):
    riskThresholds: RiskThresholdsBody
