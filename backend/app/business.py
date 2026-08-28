"""Business logic ported from the RN mock server (src/services/api/mock/server.ts).

Response shapes must match what the React Native client expects exactly —
camelCase keys, same enum values, same semantics.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import CheckIn, Gym, Member, Membership, Notification, Sale, Service

DAY = timedelta(days=1)
DEFAULT_THRESHOLDS = {"activeMax": 4, "watchMax": 9, "atRiskMax": 14}


# ---------- date helpers ----------

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt is not None else None


def date_key(dt: datetime) -> str:
    return dt.date().isoformat()


def days_between(a: datetime, b: datetime) -> int:
    return (a.date() - b.date()).days


def days_since(dt: datetime | None) -> int:
    if dt is None:
        return 1 << 62
    return days_between(now_utc(), dt)


def days_until(dt: datetime) -> int:
    return days_between(dt, now_utc())


# ---------- risk (PRD §19) ----------


def gym_thresholds(db: Session) -> dict:
    """The gym's configured risk thresholds (gym-configurable per PRD §19)."""
    gym = db.get(Gym, "gym-1")
    if gym is None:
        return dict(DEFAULT_THRESHOLDS)
    return {
        "activeMax": gym.risk_active_max,
        "watchMax": gym.risk_watch_max,
        "atRiskMax": gym.risk_at_risk_max,
    }


def compute_risk(last_check_in_at: datetime | None, thresholds: dict | None = None) -> dict:
    if thresholds is None:
        thresholds = DEFAULT_THRESHOLDS
    inactive = days_since(last_check_in_at)
    if inactive <= thresholds["activeMax"]:
        level = "ACTIVE"
    elif inactive <= thresholds["watchMax"]:
        level = "WATCH"
    elif inactive <= thresholds["atRiskMax"]:
        level = "AT_RISK"
    else:
        level = "CRITICAL"
    return {"level": level, "daysInactive": -1 if inactive == 1 << 62 else inactive}


def is_risking(level: str) -> bool:
    return level in ("AT_RISK", "CRITICAL")


# ---------- attendance / streaks ----------

def attendance_days(db: Session, member_id: str, within_days: int) -> int:
    since = now_utc() - timedelta(days=within_days)
    return len(
        db.scalars(
            select(CheckIn).where(
                CheckIn.member_id == member_id, CheckIn.checked_in_at >= since
            )
        ).all()
    )


def current_streak(db: Session, member_id: str) -> int:
    rows = db.scalars(
        select(CheckIn).where(CheckIn.member_id == member_id)
    ).all()
    keys = sorted({date_key(c.checked_in_at) for c in rows}, reverse=True)
    if not keys:
        return 0
    key_set = set(keys)
    today = date_key(now_utc())
    yesterday = date_key(now_utc() - DAY)
    cursor = today if today in key_set else (yesterday if yesterday in key_set else None)
    if cursor is None:
        return 0
    streak = 0
    while cursor in key_set:
        streak += 1
        cursor = date_key(datetime.fromisoformat(cursor) - DAY)
    return streak


def best_streak(db: Session, member_id: str) -> int:
    rows = db.scalars(
        select(CheckIn).where(CheckIn.member_id == member_id)
    ).all()
    keys = sorted({date_key(c.checked_in_at) for c in rows})
    best = run = 0
    prev = None
    for k in keys:
        if prev is not None and (datetime.fromisoformat(k) - datetime.fromisoformat(prev)) == DAY:
            run += 1
        else:
            run = 1
        best = max(best, run)
        prev = k
    return max(best, current_streak(db, member_id))


def last_30_days(db: Session, member_id: str) -> dict[str, bool]:
    out: dict[str, bool] = {}
    today = now_utc()
    keys = {date_key(c.checked_in_at) for c in db.scalars(
        select(CheckIn).where(CheckIn.member_id == member_id)
    ).all()}
    for d in range(29, -1, -1):
        out[date_key(today - timedelta(days=d))] = date_key(today - timedelta(days=d)) in keys
    return out


# ---------- serializers (camelCase, matching client types) ----------

def membership_dict(m: Membership | None) -> dict | None:
    if m is None:
        return None
    return {
        "id": m.id,
        "memberId": m.member_id,
        "planId": m.plan_id,
        "planName": m.plan_name,
        "startDate": iso(m.start_date),
        "endDate": iso(m.end_date),
        "price": m.price,
        "status": m.status,
        "autoRenew": m.auto_renew,
    }


def member_with_risk(db: Session, m: Member) -> dict:
    mem = db.scalar(select(Membership).where(Membership.member_id == m.id))
    risk = compute_risk(m.last_check_in_at, gym_thresholds(db))
    return {
        "id": m.id,
        "gymId": m.gym_id,
        "userId": m.user_id,
        "name": m.name,
        "phone": m.phone,
        "email": m.email,
        "status": m.status,
        "lastCheckInAt": iso(m.last_check_in_at),
        "createdAt": iso(m.created_at),
        "membership": membership_dict(mem),
        "risk": risk,
        "monthlyAttendance": attendance_days(db, m.id, 30),
        "currentStreak": current_streak(db, m.id),
    }


def timeline_for(db: Session, member_id: str) -> list[dict]:
    events: list[dict] = []
    for c in db.scalars(
        select(CheckIn).where(CheckIn.member_id == member_id)
    ).all():
        events.append({"id": f"e-{c.id}", "type": "CHECKIN", "title": "Check-in", "at": iso(c.checked_in_at)})
    mem = db.scalar(select(Membership).where(Membership.member_id == member_id))
    if mem is not None:
        events.append({"id": f"e-mem-{mem.id}", "type": "PAYMENT", "title": f"Payment · {mem.plan_name}", "at": iso(mem.start_date), "amount": mem.price})
        events.append({"id": f"e-renew-{mem.id}", "type": "RENEWAL", "title": "Membership renewed", "at": iso(mem.start_date), "amount": mem.price})
    for s in db.scalars(select(Sale).where(Sale.member_id == member_id)).all():
        svc = db.get(Service, s.service_id)
        events.append({"id": f"e-sale-{s.id}", "type": "SALE", "title": f"Purchased {svc.name if svc else 'service'}", "at": iso(s.created_at), "amount": s.amount})
    events.sort(key=lambda e: e["at"], reverse=True)
    return events


def has_purchased(db: Session, member_id: str, category: str) -> bool:
    for s in db.scalars(select(Sale).where(Sale.member_id == member_id)).all():
        svc = db.get(Service, s.service_id)
        if svc is not None and svc.category == category:
            return True
    return False


# ---------- opportunity engine (PRD §12) ----------

def compute_opportunities(db: Session) -> list[dict]:
    out: list[dict] = []
    for m in db.scalars(select(Member)).all():
        if m.status != "ACTIVE":
            continue
        mem = db.scalar(select(Membership).where(Membership.member_id == m.id))
        if mem is None or mem.status != "ACTIVE":
            continue
        risk = compute_risk(m.last_check_in_at, gym_thresholds(db))
        if risk["level"] in ("AT_RISK", "CRITICAL"):
            continue
        rate = attendance_days(db, m.id, 30)

        if not has_purchased(db, m.id, "PT"):
            svc = db.scalar(select(Service).where(Service.category == "PT", Service.active == True))  # noqa: E712
            if svc is not None and rate >= 8:
                out.append({"memberId": m.id, "memberName": m.name, "phone": m.phone, "serviceId": svc.id, "serviceName": svc.name, "category": "PT", "price": svc.price, "reason": "Active member, high attendance, no PT package"})
        if not has_purchased(db, m.id, "DIET"):
            svc = db.scalar(select(Service).where(Service.category == "DIET", Service.active == True))  # noqa: E712
            if svc is not None:
                out.append({"memberId": m.id, "memberName": m.name, "phone": m.phone, "serviceId": svc.id, "serviceName": svc.name, "category": "DIET", "price": svc.price, "reason": "Active member without a diet plan"})
        if not has_purchased(db, m.id, "SUPPLEMENT"):
            svc = db.scalar(select(Service).where(Service.category == "SUPPLEMENT", Service.active == True))  # noqa: E712
            if svc is not None:
                out.append({"memberId": m.id, "memberName": m.name, "phone": m.phone, "serviceId": svc.id, "serviceName": svc.name, "category": "SUPPLEMENT", "price": svc.price, "reason": "Active member eligible for supplement add-on"})
    return out


def opportunity_summary(db: Session) -> dict:
    opts = compute_opportunities(db)
    summary = {}
    for cat in ("PT", "DIET", "SUPPLEMENT"):
        lst = [o for o in opts if o["category"] == cat]
        summary[cat.lower()] = {"count": len(lst), "potential": sum(o["price"] for o in lst)}
    return summary


# ---------- renewals ----------

def upcoming_renewals(db: Session, limit: int | None = None) -> list[dict]:
    rows = db.scalars(select(Membership)).all()
    out = []
    for mem in rows:
        days = days_until(mem.end_date)
        if days < 0 or days > 30:
            continue
        member = db.get(Member, mem.member_id)
        if member is None:
            continue
        out.append({
            "memberId": member.id,
            "membershipId": mem.id,
            "memberName": member.name,
            "planName": mem.plan_name,
            "price": mem.price,
            "endDate": iso(mem.end_date),
            "daysUntilExpiry": days,
            "riskLevel": compute_risk(member.last_check_in_at, gym_thresholds(db))["level"],
        })
    out.sort(key=lambda r: r["daysUntilExpiry"])
    return out[:limit] if limit else out


# ---------- dashboard (PRD §4) ----------

def dashboard_summary(db: Session) -> dict:
    members = db.scalars(select(Member)).all()
    active = [m for m in members if m.status == "ACTIVE"]
    th = gym_thresholds(db)
    risked = [member_with_risk(db, m) for m in members if is_risking(compute_risk(m.last_check_in_at, th)["level"])]
    revenue_at_risk = sum((m["membership"] or {}).get("price") or 0 for m in risked)

    today = now_utc()
    today_key = date_key(today)
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    def count_since(since: datetime | None = None, key: str | None = None) -> int:
        rows = db.scalars(select(CheckIn)).all()
        if key is not None:
            return len([c for c in rows if date_key(c.checked_in_at) == key])
        return len([c for c in rows if c.checked_in_at >= since])

    checkins_today = count_since(key=today_key)
    checkins_week = count_since(since=week_ago)
    checkins_month = count_since(since=month_ago)

    weekly_trend = []
    for d in range(6, -1, -1):
        k = date_key(today - timedelta(days=d))
        weekly_trend.append(count_since(key=k))

    renewals = upcoming_renewals(db)
    month_prefix = today.strftime("%Y-%m")
    add_on_this_month = sum(
        s.amount for s in db.scalars(select(Sale)).all()
        if s.status == "COMPLETED" and s.created_at.strftime("%Y-%m") == month_prefix
    )
    all_sales = db.scalars(select(Sale)).all()
    membership_30 = [m for m in db.scalars(select(Membership)).all() if 0 <= days_until(m.end_date) <= 30]

    return {
        "activeMembers": len(active),
        "atRiskCount": len([m for m in risked if m["risk"]["level"] == "AT_RISK"]),
        "criticalCount": len([m for m in risked if m["risk"]["level"] == "CRITICAL"]),
        "revenueAtRisk": revenue_at_risk,
        "renewalsExpected": sum(m.price for m in membership_30),
        "renewalsDueToday": len([r for r in renewals if r["daysUntilExpiry"] == 0]),
        "renewalsNext7Days": len([r for r in renewals if r["daysUntilExpiry"] <= 7]),
        "renewalsNext30Days": len(renewals),
        "renewalsOverdue": len([m for m in db.scalars(select(Membership)).all() if m.status == "EXPIRED"]),
        "addOnRevenue": sum(s.amount for s in all_sales if s.status == "COMPLETED"),
        "addOnRevenueThisMonth": add_on_this_month,
        "checkinsToday": checkins_today,
        "checkinsThisWeek": checkins_week,
        "checkinsThisMonth": checkins_month,
        "weeklyTrend": weekly_trend,
        "upcomingRenewals": renewals[:5],
        "opportunities": opportunity_summary(db),
    }


def risk_summary(db: Session) -> dict:
    out = {"active": 0, "watch": 0, "atRisk": 0, "critical": 0}
    for m in db.scalars(select(Member)).all():
        level = compute_risk(m.last_check_in_at, gym_thresholds(db))["level"]
        if level == "ACTIVE":
            out["active"] += 1
        elif level == "WATCH":
            out["watch"] += 1
        elif level == "AT_RISK":
            out["atRisk"] += 1
        else:
            out["critical"] += 1
    return out


# ---------- notifications (PRD §13) ----------

def push_notification(db: Session, kind: str, title: str, body: str) -> None:
    db.add(Notification(id=f"notif-{now_utc().timestamp()}-{secrets_id()}", kind=kind, title=title, body=body))
    db.commit()


import secrets  # noqa: E402


def secrets_id() -> str:
    return secrets.token_hex(4)
