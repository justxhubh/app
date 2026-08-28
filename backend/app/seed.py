"""Deterministic seed data — a faithful port of src/services/api/mock/db.ts
(mulberry32 PRNG with the same call order) so the real backend looks
identical to the mock.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base, engine
from .models import (
    CheckIn,
    Gym,
    Member,
    Membership,
    MembershipPlan,
    Sale,
    Service,
    User,
)
from .business import now_utc

FIRST = [
    "Rahul", "Priya", "Amit", "Neha", "Vikram", "Sneha", "Rohan", "Ananya", "Karan", "Pooja",
    "Arjun", "Divya", "Siddharth", "Meera", "Aditya", "Riya", "Nikhil", "Kavya", "Sanjay", "Ishita",
    "Manish", "Tanvi", "Gaurav", "Shreya", "Deepak", "Aarti", "Suresh", "Nandini", "Rakesh", "Swati",
    "Harish", "Pallavi", "Vinod", "Kiran", "Ashish", "Lakshmi", "Mohan", "Ritu", "Prakash", "Anjali",
    "Naveen", "Simran", "Rajesh", "Komal", "Sachin", "Madhavi", "Yash", "Bhavna", "Imran", "Farah",
    "Ravi", "Gita", "Omkar", "Sonal", "Dinesh", "Pratibha", "Akhil", "Rashmi", "Vivek", "Shweta",
]

LAST = [
    "Sharma", "Mehta", "Patel", "Singh", "Kumar", "Gupta", "Reddy", "Iyer", "Nair", "Joshi",
    "Chopra", "Malhotra", "Verma", "Saxena", "Desai", "Kulkarni", "Pillai", "Mishra", "Bhatt", "Agarwal",
    "Rao", "Das", "Banerjee", "Kapoor", "Kohli", "Sethi", "Menon", "Shah", "Chauhan", "Yadav",
    "Tiwari", "Ghosh", "Bose", "Dutta", "Nayak", "Shetty", "Kaur", "Arora", "Bajaj", "Khanna",
]


def mulberry32(seed: int):
    a = seed & 0xFFFFFFFF

    def rng() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = (t ^ (t >> 15)) & 0xFFFFFFFF
        t = (t * (t | 1)) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) & 0xFFFFFFFF) * (t | 61)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rng


def _gen_seeds(rng) -> list[dict]:
    seeds = []
    total = 46
    for i in range(total):
        name = f"{FIRST[(i * 7 + 3) % len(FIRST)]} {LAST[(i * 11 + 5) % len(LAST)]}"
        role = i % 7
        if role == 0:
            days_inactive = 15 + int(rng() * 14) if rng() < 0.5 else -1
        elif role == 1:
            days_inactive = 10 + int(rng() * 5)
        elif role == 2:
            days_inactive = 5 + int(rng() * 5)
        else:
            days_inactive = int(rng() * 5)

        expiry_roll = rng()
        if expiry_roll < 0.12:
            days_to_expiry = -(1 + int(rng() * 10))
        elif expiry_roll < 0.35:
            days_to_expiry = int(rng() * 8)
        elif expiry_roll < 0.6:
            days_to_expiry = 8 + int(rng() * 23)
        else:
            days_to_expiry = 31 + int(rng() * 200)

        r = rng()
        if r < 0.15:
            plan_index = 0
        elif r < 0.55:
            plan_index = 1
        elif r < 0.85:
            plan_index = 2
        else:
            plan_index = 3

        seeds.append({
            "id": f"m-{i + 1}",
            "name": name,
            "phone": f"98{str(70000000 + i * 12345)[:8]}",
            "daysInactive": days_inactive,
            "daysToExpiry": days_to_expiry,
            "planIndex": plan_index,
            "attendanceRate": 0.35 + rng() * 0.5,
            "autoRenew": rng() < 0.3,
        })
    # Demo member account used by the member app flow (phone 9876543210).
    seeds[1] = {
        **seeds[1],
        "name": "Priya Mehta",
        "phone": "9876543210",
        "daysInactive": 1,  # last check-in yesterday — scanning today completes a 7-day streak
        "daysToExpiry": 6,
        "planIndex": 1,
        "attendanceRate": 0.75,
    }
    return seeds


def seed(db: Session) -> None:
    rng = mulberry32(20260814)
    now = now_utc()

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    gym = Gym(id="gym-1", name="Iron Forge Fitness", address="MG Road, Pune", owner_id="u-owner", timezone="Asia/Kolkata", created_at=now - timedelta(days=600))
    db.add(gym)

    owner = User(id="u-owner", name="Raj", phone="9822000000", email="raj@ironforge.in", role="OWNER", gym_id="gym-1", created_at=now - timedelta(days=600))
    db.add(owner)

    plans = [
        MembershipPlan(id="plan-basic", name="Basic Monthly", type="MONTHLY", price=1499, duration_days=30),
        MembershipPlan(id="plan-gold", name="Gold Monthly", type="MONTHLY", price=2499, duration_days=30),
        MembershipPlan(id="plan-premium", name="Premium Monthly", type="MONTHLY", price=3999, duration_days=30),
        MembershipPlan(id="plan-gold-yearly", name="Gold Yearly", type="YEARLY", price=24990, duration_days=365),
    ]
    db.add_all(plans)

    services = [
        Service(id="svc-pt", gym_id="gym-1", name="8 PT Sessions", category="PT", price=4000, active=True),
        Service(id="svc-pt-12", gym_id="gym-1", name="12 PT Sessions", category="PT", price=5500, active=True),
        Service(id="svc-diet", gym_id="gym-1", name="Monthly Diet Plan", category="DIET", price=999, active=True),
        Service(id="svc-diet-premium", gym_id="gym-1", name="Premium Diet Plan", category="DIET", price=1999, active=True),
        Service(id="svc-whey", gym_id="gym-1", name="Whey Protein 1kg", category="SUPPLEMENT", price=2499, active=True),
        Service(id="svc-creatine", gym_id="gym-1", name="Creatine 250g", category="SUPPLEMENT", price=899, active=True),
    ]
    db.add_all(services)
    db.flush()

    seeds = _gen_seeds(rng)

    members = []
    for s in seeds:
        members.append(Member(
            id=s["id"],
            gym_id="gym-1",
            name=s["name"],
            phone=s["phone"],
            email=f"{s['name'].lower().replace(' ', '.')}@example.com",
            status="EXPIRED" if s["daysToExpiry"] < 0 else "ACTIVE",
            last_check_in_at=None if s["daysInactive"] == -1 else now - timedelta(days=s["daysInactive"]),
            created_at=now - timedelta(days=60 + int(rng() * 400)),
        ))
    db.add_all(members)
    db.flush()

    memberships = []
    for i, s in enumerate(seeds):
        plan = plans[s["planIndex"]]
        end = now + timedelta(days=s["daysToExpiry"])
        memberships.append(Membership(
            id=f"mem-{i + 1}",
            member_id=s["id"],
            plan_id=plan.id,
            plan_name=plan.name,
            start_date=end - timedelta(days=plan.duration_days),
            end_date=end,
            price=plan.price,
            status="EXPIRED" if s["daysToExpiry"] < 0 else "ACTIVE",
            auto_renew=s["autoRenew"],
        ))
    db.add_all(memberships)

    # Check-in history over the last 45 days (same structure as the mock).
    checkins = []
    ci_id = 1
    for s in seeds:
        stop_days = 45 + int(rng() * 30) if s["daysInactive"] == -1 else s["daysInactive"]
        for d in range(45):
            if s["id"] == "m-2":
                if d == 0:
                    continue
                if d > 6 and rng() > 0.55:
                    continue
            elif d < stop_days:
                continue
            elif rng() >= s["attendanceRate"]:
                continue
            at = now - timedelta(days=d)
            at = at.replace(hour=6 + int(rng() * 13), minute=int(rng() * 60), second=0, microsecond=0)
            checkins.append(CheckIn(
                id=f"ci-{ci_id}",
                member_id=s["id"],
                gym_id="gym-1",
                checked_in_at=at,
                source="QR" if rng() < 0.9 else "MANUAL",
            ))
            ci_id += 1
    db.add_all(checkins)

    # Sales: ~18% PT, 14% diet, 12% supplement (same buckets as the mock).
    sales = []
    sale_id = 1
    for s in seeds:
        if s["daysInactive"] >= 15:
            continue
        r = rng()
        if r < 0.18:
            svc = services[0]
        elif r < 0.32:
            svc = services[2]
        elif r < 0.44:
            svc = services[4]
        else:
            continue
        sales.append(Sale(
            id=f"sale-{sale_id}",
            member_id=s["id"],
            service_id=svc.id,
            amount=svc.price,
            status="COMPLETED",
            created_at=now - timedelta(days=int(rng() * 40)),
        ))
        sale_id += 1
    db.add_all(sales)

    db.commit()
    print(f"Seeded: gym={gym.name}, {len(members)} members, {len(checkins)} check-ins, {len(sales)} sales")


def main() -> None:
    from .db import SessionLocal

    with SessionLocal() as db:
        seed(db)


if __name__ == "__main__":
    main()
