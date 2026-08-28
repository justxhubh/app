import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .business import (
    attendance_days,
    best_streak,
    compute_opportunities,
    compute_risk,
    current_streak,
    dashboard_summary,
    gym_thresholds,
    iso,
    last_30_days,
    now_utc,
    opportunity_summary,
    push_notification,
    risk_summary,
    timeline_for,
    upcoming_renewals,
    membership_dict,
    member_with_risk,
)
from .config import CHECKIN_DUPLICATE_MINUTES, DEMO_OTP
from .db import get_db
from .models import AuthToken, CheckIn, Gym, Member, Membership, MembershipPlan, Notification, Sale, Service, User
from .schemas import (
    CheckInBody,
    ReadNotificationBody,
    RefreshBody,
    RemindBody,
    RenewBody,
    SaleBody,
    SendOtpBody,
    ServiceBody,
    SettingsBody,
    UpdateMemberBody,
    VerifyOtpBody,
)
from .security import get_current_user, issue_session, require_owner, revoke_tokens

router = APIRouter()

# OTPs issued in this process (demo: always 1234).
OTPS: dict[str, str] = {}


# ---------- helpers ----------

def user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "phone": u.phone,
        "email": u.email,
        "role": u.role,
        "gymId": u.gym_id,
        "createdAt": iso(u.created_at),
    }


def gym_dict(g: Gym) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "address": g.address,
        "ownerId": g.owner_id,
        "timezone": g.timezone,
        "createdAt": iso(g.created_at),
    }


def session_dict(db: Session, user: User) -> dict:
    tokens = issue_session(db, user)
    gym = db.get(Gym, user.gym_id)
    return {"user": user_dict(user), "gym": gym_dict(gym), **tokens}


def get_member_user(db: Session, member: Member) -> User:
    if member.user_id:
        user = db.get(User, member.user_id)
        if user:
            return user
    user = User(
        id=f"u-{member.id}",
        name=member.name,
        phone=member.phone,
        email=member.email,
        role="MEMBER",
        gym_id=member.gym_id,
    )
    db.add(user)
    db.flush()
    member.user_id = user.id
    db.commit()
    return user


def _member_or_forbidden(db: Session, user: User, member_id: str) -> Member:
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if user.role != "OWNER" and user.id != f"u-{member_id}":
        raise HTTPException(status_code=403, detail="Forbidden")
    return member


# ---------- auth (PRD §14) ----------

@router.post("/auth/send-otp")
def send_otp(body: SendOtpBody):
    OTPS[body.phone] = DEMO_OTP
    return {"ok": True, "otp": DEMO_OTP, "message": "OTP sent (demo: 1234)"}


@router.post("/auth/verify-otp")
def verify_otp(body: VerifyOtpBody, db: Session = Depends(get_db)):
    if OTPS.get(body.phone) and OTPS[body.phone] != body.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if body.phone == "9822000000":
        return session_dict(db, db.get(User, "u-owner"))
    member = db.scalar(select(Member).where(Member.phone == body.phone))
    if member is None:
        raise HTTPException(status_code=404, detail="No account found for this phone. Use demo numbers.")
    return session_dict(db, get_member_user(db, member))


@router.post("/auth/refresh")
def refresh(body: RefreshBody, db: Session = Depends(get_db)):
    token = db.scalar(
        select(AuthToken).where(AuthToken.token == body.refreshToken, AuthToken.type == "refresh")
    )
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if token.expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Refresh token expired")
    user = db.get(User, token.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    # Rotate: invalidate the old refresh token, issue a fresh pair.
    db.delete(token)
    db.commit()
    return session_dict(db, user)


@router.post("/auth/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    revoke_tokens(db, user.id)
    return {"ok": True}


# ---------- dashboard (PRD §4) ----------

@router.get("/dashboard/summary")
def dashboard(_: User = Depends(require_owner), db: Session = Depends(get_db)):
    return dashboard_summary(db)


@router.get("/dashboard/risk-summary")
def risk_summary_route(_: User = Depends(require_owner), db: Session = Depends(get_db)):
    return risk_summary(db)


# ---------- gym settings (configurable risk thresholds, PRD §19) ----------

@router.get("/settings")
def get_settings(_: User = Depends(require_owner), db: Session = Depends(get_db)):
    return {"riskThresholds": gym_thresholds(db)}


@router.patch("/settings")
def update_settings(body: SettingsBody, _: User = Depends(require_owner), db: Session = Depends(get_db)):
    t = body.riskThresholds
    if not (t.activeMax < t.watchMax < t.atRiskMax):
        raise HTTPException(status_code=400, detail="Thresholds must be strictly increasing: active < watch < at risk")
    gym = db.get(Gym, "gym-1")
    gym.risk_active_max = t.activeMax
    gym.risk_watch_max = t.watchMax
    gym.risk_at_risk_max = t.atRiskMax
    db.commit()
    return {"ok": True, "riskThresholds": gym_thresholds(db)}


# ---------- members ----------

@router.get("/members")
def list_members(
    search: str = "",
    risk: str = "",
    status: str = "",
    sort: str = "risk",
    _: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    members = db.scalars(select(Member)).all()
    rows = [member_with_risk(db, m) for m in members]
    if search:
        s = search.lower()
        rows = [r for r in rows if s in r["name"].lower() or s in r["phone"] or s in r["id"].lower()]
    if risk:
        rows = [r for r in rows if r["risk"]["level"] == risk]
    if status:
        rows = [r for r in rows if r["status"] == status]
    order = {"ACTIVE": 0, "WATCH": 1, "AT_RISK": 2, "CRITICAL": 3}
    if sort == "risk":
        rows.sort(key=lambda r: order[r["risk"]["level"]], reverse=True)
    elif sort == "name":
        rows.sort(key=lambda r: r["name"].lower())
    elif sort == "renewal":
        def renew_day(r):
            m = r["membership"]
            return (m["endDate"] if m else "9999") 
        rows.sort(key=renew_day)
    return {"members": rows}


@router.get("/members/at-risk")
def at_risk(_: User = Depends(require_owner), db: Session = Depends(get_db)):
    rows = [member_with_risk(db, m) for m in db.scalars(select(Member)).all()]
    return {"members": [r for r in rows if r["risk"]["level"] in ("AT_RISK", "CRITICAL")]}


@router.get("/members/{member_id}")
def member_profile(member_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    member = _member_or_forbidden(db, user, member_id)
    membership = db.scalar(select(Membership).where(Membership.member_id == member.id))
    return {
        "member": member_with_risk(db, member),
        "membership": membership_dict(membership),
        "timeline": timeline_for(db, member.id),
        "opportunities": {
            "pt": not _has_purchased(db, member.id, "PT"),
            "diet": not _has_purchased(db, member.id, "DIET"),
            "supplement": not _has_purchased(db, member.id, "SUPPLEMENT"),
        },
    }


@router.patch("/members/{member_id}")
def update_member(member_id: str, body: UpdateMemberBody, _: User = Depends(require_owner), db: Session = Depends(get_db)):
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if body.status is not None:
        member.status = body.status
    if body.name is not None:
        member.name = body.name
    if body.phone is not None:
        member.phone = body.phone
    db.commit()
    return {"ok": True, "member": member_with_risk(db, member)}


def _has_purchased(db: Session, member_id: str, category: str) -> bool:
    for s in db.scalars(select(Sale).where(Sale.member_id == member_id)).all():
        svc = db.get(Service, s.service_id)
        if svc is not None and svc.category == category:
            return True
    return False


# ---------- attendance / check-in (PRD §7) ----------

@router.get("/members/{member_id}/attendance")
def member_attendance(member_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _member_or_forbidden(db, user, member_id)
    days = last_30_days(db, member_id)
    this_month = attendance_days(db, member_id, 30)
    return {
        "memberId": member_id,
        "thisMonth": this_month,
        "attendanceRate": min(100, round(this_month / 30 * 100)),
        "currentStreak": current_streak(db, member_id),
        "bestStreak": best_streak(db, member_id),
        "last30Days": days,
    }


@router.get("/attendance/summary")
def attendance_summary(_: User = Depends(require_owner), db: Session = Depends(get_db)):
    now = now_utc()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    rows = db.scalars(select(CheckIn)).all()
    today_key = now.date().isoformat()
    today = len([c for c in rows if c.checked_in_at.date().isoformat() == today_key])
    week = len([c for c in rows if c.checked_in_at >= week_ago])
    month = len([c for c in rows if c.checked_in_at >= month_ago])
    member_count = max(1, len(db.scalars(select(Member)).all()))
    return {"today": today, "week": week, "month": month, "averagePerMember": round(month / member_count, 1)}


@router.post("/checkins")
def check_in(body: CheckInBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    member = db.get(Member, body.memberId)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")

    gym = db.get(Gym, member.gym_id)
    if body.qrPayload and f"gym:{gym.id}" not in body.qrPayload:
        raise HTTPException(status_code=400, detail="Invalid or expired QR code")

    cutoff = now_utc() - timedelta(minutes=CHECKIN_DUPLICATE_MINUTES)
    dup = db.scalar(
        select(CheckIn).where(CheckIn.member_id == body.memberId, CheckIn.checked_in_at >= cutoff)
        .order_by(CheckIn.checked_in_at.desc())
    )
    if dup is not None:
        time_str = dup.checked_in_at.strftime("%I:%M %p").lower().lstrip("0")
        raise HTTPException(status_code=409, detail=f"Already checked in at {time_str}. Try again later.")

    check_in_row = CheckIn(
        id=f"ci-{int(now_utc().timestamp() * 1000)}-{secrets.token_hex(3)}",
        member_id=body.memberId,
        gym_id=member.gym_id,
        checked_in_at=now_utc(),
        source=body.source,
    )
    db.add(check_in_row)
    member.last_check_in_at = check_in_row.checked_in_at
    db.flush()

    streak = current_streak(db, body.memberId)
    if streak in (7, 14, 30):
        push_notification(db, "streak", f"🔥 {streak}-day streak!", f"{member.name} is on a {streak}-day streak. Keep it going!")

    message = f"Check-in recorded · {check_in_row.checked_in_at.strftime('%d %b, %Y')}"
    db.commit()
    return {
        "checkIn": {
            "id": check_in_row.id,
            "memberId": check_in_row.member_id,
            "gymId": check_in_row.gym_id,
            "checkedInAt": iso(check_in_row.checked_in_at),
            "source": check_in_row.source,
            "deviceId": check_in_row.device_id,
        },
        "streak": streak,
        "memberName": member.name,
        "message": message,
    }


# ---------- renewals (PRD §9–§10) ----------

@router.get("/renewals")
def renewals(_: User = Depends(require_owner), db: Session = Depends(get_db)):
    rows = []
    for mem in db.scalars(select(Membership)).all():
        member = db.get(Member, mem.member_id)
        if member is None:
            continue
        rows.append({
            **membership_dict(mem),
            "memberName": member.name,
            "memberPhone": member.phone,
            "daysUntilExpiry": (mem.end_date.date() - now_utc().date()).days,
            "riskLevel": compute_risk(member.last_check_in_at)["level"],
        })
    rows.sort(key=lambda r: r["daysUntilExpiry"])
    expected = sum(r["price"] for r in rows if 0 <= r["daysUntilExpiry"] <= 30)
    return {"renewals": rows, "expected": expected}


@router.post("/renewals/{membership_id}/remind")
def remind(membership_id: str, body: RemindBody | None = None, _: User = Depends(require_owner), db: Session = Depends(get_db)):
    mem = db.get(Membership, membership_id)
    if mem is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    member = db.get(Member, mem.member_id)
    name = member.name if member else "Member"
    push_notification(
        db,
        "renewal",
        f"Reminder sent to {name}",
        f"Renewal reminder sent · {mem.plan_name} · {mem.end_date.strftime('%d %b')}",
    )
    return {"ok": True, "message": "Reminder sent"}


@router.post("/renewals/{membership_id}/renew")
def renew(membership_id: str, body: RenewBody | None = None, _: User = Depends(require_owner), db: Session = Depends(get_db)):
    mem = db.get(Membership, membership_id)
    if mem is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    plan = db.get(MembershipPlan, mem.plan_id)
    days = body.days if body and body.days else (plan.duration_days if plan else 30)
    mem.start_date = now_utc()
    mem.end_date = now_utc() + timedelta(days=days)
    mem.status = "ACTIVE"
    member = db.get(Member, mem.member_id)
    if member is not None:
        member.status = "ACTIVE"
    name = member.name if member else "Member"
    push_notification(db, "renewal", f"{name} renewed", f"{mem.plan_name} renewed for {days} days")
    db.commit()
    return {"ok": True, "message": "Membership renewed", "membership": membership_dict(mem)}


# ---------- revenue (PRD §11–§12) ----------

@router.get("/revenue/summary")
def revenue_summary(_: User = Depends(require_owner), db: Session = Depends(get_db)):
    completed = [s for s in db.scalars(select(Sale)).all() if s.status == "COMPLETED"]
    month_prefix = now_utc().strftime("%Y-%m")
    this_month = [s for s in completed if s.created_at.strftime("%Y-%m") == month_prefix]

    def by_category(cat: str) -> float:
        return sum(s.amount for s in completed if (db.get(Service, s.service_id) or Service()).category == cat)

    sales = []
    for s in sorted(completed, key=lambda x: x.created_at, reverse=True)[:25]:
        member = db.get(Member, s.member_id)
        svc = db.get(Service, s.service_id)
        sales.append({
            "id": s.id,
            "memberId": s.member_id,
            "serviceId": s.service_id,
            "amount": s.amount,
            "status": s.status,
            "createdAt": iso(s.created_at),
            "memberName": member.name if member else "Unknown",
            "serviceName": svc.name if svc else "Service",
        })
    return {
        "totalRevenue": sum(s.amount for s in completed),
        "thisMonth": sum(s.amount for s in this_month),
        "pt": by_category("PT"),
        "diet": by_category("DIET"),
        "supplement": by_category("SUPPLEMENT"),
        "sales": sales,
    }


@router.get("/revenue/opportunities")
def opportunities(category: str = "", _: User = Depends(require_owner), db: Session = Depends(get_db)):
    opts = compute_opportunities(db)
    if category:
        opts = [o for o in opts if o["category"] == category]
    return {"opportunities": opts, "summary": opportunity_summary(db)}


@router.get("/services")
def list_services(_: User = Depends(require_owner), db: Session = Depends(get_db)):
    services = db.scalars(select(Service)).all()
    return {"services": [
        {"id": s.id, "gymId": s.gym_id, "name": s.name, "category": s.category, "price": s.price, "active": s.active}
        for s in services
    ]}


@router.post("/services")
def create_service(body: ServiceBody, _: User = Depends(require_owner), db: Session = Depends(get_db)):
    svc = Service(
        id=f"svc-{int(now_utc().timestamp() * 1000)}",
        gym_id="gym-1",
        name=body.name,
        category=body.category,
        price=body.price,
        active=True,
    )
    db.add(svc)
    db.commit()
    return {"service": {"id": svc.id, "gymId": svc.gym_id, "name": svc.name, "category": svc.category, "price": svc.price, "active": svc.active}}


@router.post("/sales")
def record_sale(body: SaleBody, _: User = Depends(require_owner), db: Session = Depends(get_db)):
    svc = db.get(Service, body.serviceId)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")
    sale = Sale(
        id=f"sale-{int(now_utc().timestamp() * 1000)}",
        member_id=body.memberId,
        service_id=body.serviceId,
        amount=svc.price,
        status="COMPLETED",
        created_at=now_utc(),
    )
    db.add(sale)
    db.flush()
    member = db.get(Member, body.memberId)
    push_notification(
        db,
        "revenue",
        f"Sale recorded · {svc.name}",
        f"{(member.name if member else 'Member')} purchased {svc.name} for ₹{int(svc.price)}",
    )
    db.commit()
    return {
        "sale": {
            "id": sale.id,
            "memberId": sale.member_id,
            "serviceId": sale.service_id,
            "amount": sale.amount,
            "status": sale.status,
            "createdAt": iso(sale.created_at),
        },
        "message": "Sale recorded",
    }


# ---------- notifications (PRD §13) ----------

@router.get("/notifications")
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).order_by(Notification.created_at.desc())).all()
    return {"notifications": [
        {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "createdAt": iso(n.created_at), "read": n.read}
        for n in rows
    ]}


@router.post("/notifications/read")
def mark_read(body: ReadNotificationBody, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(Notification, body.id)
    if item is not None:
        item.read = True
        db.commit()
    return {"ok": True}
