"""HTTP smoke test for the real FastAPI backend — mirrors scripts/smoke.ts.

Run with:  ./.venv/bin/python smoke_api.py   (server must be running on :8000)
"""
import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
failures = 0


def check(name, cond, extra=""):
    global failures
    if cond:
        print(f"  ✓ {name}")
    else:
        failures += 1
        print(f"  ✗ {name} {extra}")


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read().decode()).get("detail", "")
        except Exception:
            pass
        raise ApiError(e.code, detail) from None


class ApiError(Exception):
    def __init__(self, status, detail):
        super().__init__(detail)
        self.status = status


def expect_error(name, fn, status):
    global failures
    try:
        fn()
        failures += 1
        print(f"  ✗ {name} — expected {status}, none thrown")
    except ApiError as e:
        if e.status == status:
            print(f"  ✓ {name}")
        else:
            failures += 1
            print(f"  ✗ {name} — got {e.status}")


def main():
    print("\nAuth")
    status, res = call("POST", "/auth/send-otp", {"phone": "9822000000"})
    check("send-otp returns demo OTP", res.get("otp") == "1234")
    status, session = call("POST", "/auth/verify-otp", {"phone": "9822000000", "otp": "1234"})
    check("verify-otp returns owner session", session["user"]["role"] == "OWNER")
    check("session has access + refresh tokens", session["accessToken"].startswith("at_") and session["refreshToken"].startswith("rt_"))
    expect_error("verify-otp with wrong OTP", lambda: call("POST", "/auth/verify-otp", {"phone": "9822000000", "otp": "9999"}), 400)
    expect_error("protected route without token", lambda: call("GET", "/dashboard/summary"), 401)
    owner = session["accessToken"]

    print("\nMember auth + tokens")
    status, member_session = call("POST", "/auth/verify-otp", {"phone": "9876543210", "otp": "1234"})
    check("member login returns MEMBER role", member_session["user"]["role"] == "MEMBER")
    check("member user id matches client convention", member_session["user"]["id"] == "u-m-2", member_session["user"]["id"])
    member_tok = member_session["accessToken"]
    status, own = call("GET", "/members/m-2", token=member_tok)
    check("member token authorizes own profile", own["member"]["id"] == "m-2")
    expect_error("member blocked from owner dashboard", lambda: call("GET", "/dashboard/summary", token=member_tok), 403)
    status, refreshed = call("POST", "/auth/refresh", {"refreshToken": member_session["refreshToken"]})
    check("refresh token issues a new session", refreshed["accessToken"].startswith("at_"))
    status, own2 = call("GET", "/members/m-2", token=refreshed["accessToken"])
    check("new access token works", own2["member"]["id"] == "m-2")

    print("\nDashboard")
    status, dash = call("GET", "/dashboard/summary", token=owner)
    check("active members > 0", dash["activeMembers"] > 0, dash["activeMembers"])
    check("at-risk count reported", isinstance(dash["atRiskCount"], int))
    check("revenue at risk is a number", isinstance(dash["revenueAtRisk"], (int, float)))
    check("weekly trend has 7 entries", len(dash["weeklyTrend"]) == 7)
    check("upcoming renewals sorted", all(dash["upcomingRenewals"][i - 1]["daysUntilExpiry"] <= r["daysUntilExpiry"] for i, r in enumerate(dash["upcomingRenewals"]) if i > 0))

    print("\nMembers & risk")
    status, members = call("GET", "/members", token=owner)
    levels = {r["risk"]["level"] for r in members["members"]}
    check("all four risk buckets present", levels >= {"ACTIVE", "WATCH", "AT_RISK", "CRITICAL"}, levels)
    status, search = call("GET", "/members?search=rahul", token=owner)
    check("search works", all("rahul" in r["name"].lower() for r in search["members"]))
    status, risk_summary = call("GET", "/dashboard/risk-summary", token=owner)
    check("risk summary has keys", all(k in risk_summary for k in ("active", "watch", "atRisk", "critical")))

    print("\nCheck-in flow")
    # Pick a member with no check-in in the last 5+ days so the duplicate
    # window is clear (idempotent across runs against a persistent DB).
    flow_member = next(r for r in members["members"]
                       if r["risk"]["level"] in ("WATCH", "AT_RISK") and r["membership"])
    fm_id, fm_phone = flow_member["id"], flow_member["phone"]
    status, ms = call("POST", "/auth/verify-otp", {"phone": fm_phone, "otp": "1234"})
    fm_tok = ms["accessToken"]
    status, before = call("GET", f"/members/{fm_id}", token=owner)
    res = call("POST", "/checkins", {"memberId": fm_id, "source": "QR", "qrPayload": "IFG|gym:gym-1|ts:123"}, token=fm_tok)
    check("check-in recorded", res[1]["checkIn"]["memberId"] == fm_id)
    status, after = call("GET", f"/members/{fm_id}", token=owner)
    check("lastCheckInAt updated", after["member"]["lastCheckInAt"] != before["member"]["lastCheckInAt"])
    expect_error("duplicate check-in within 30min rejected", lambda: call("POST", "/checkins", {"memberId": fm_id, "source": "QR", "qrPayload": "IFG|gym:gym-1|ts:124"}, token=fm_tok), 409)
    expect_error("invalid QR rejected", lambda: call("POST", "/checkins", {"memberId": fm_id, "source": "QR", "qrPayload": "BAD"}, token=fm_tok), 400)

    print("\nRenewals")
    status, renewals = call("GET", "/renewals", token=owner)
    rows = renewals["renewals"]
    check("renewals list has upcoming + overdue", any(0 <= r["daysUntilExpiry"] <= 30 for r in rows) and any(r["daysUntilExpiry"] < 0 for r in rows))
    check("expected revenue computed", isinstance(renewals["expected"], (int, float)) and renewals["expected"] > 0)
    first_upcoming = next(r for r in rows if 0 <= r["daysUntilExpiry"] <= 30)
    status, remind = call("POST", f"/renewals/{first_upcoming['id']}/remind", {"channel": "PUSH"}, token=owner)
    check("reminder sent", remind["ok"] is True)
    status, renewed = call("POST", f"/renewals/{first_upcoming['id']}/renew", token=owner)
    check("renewal extends membership", renewed["membership"]["endDate"] > first_upcoming["endDate"])

    print("\nRevenue")
    status, revenue = call("GET", "/revenue/summary", token=owner)
    check("revenue summary totals", revenue["totalRevenue"] >= revenue["pt"] + revenue["diet"] + revenue["supplement"])
    status, opps = call("GET", "/revenue/opportunities", token=owner)
    cats = {o["category"] for o in opps["opportunities"]}
    check("opportunities have PT/DIET/SUPPLEMENT", cats >= {"PT", "DIET", "SUPPLEMENT"}, cats)
    status, pt_only = call("GET", "/revenue/opportunities?category=PT", token=owner)
    check("category filter works", all(o["category"] == "PT" for o in pt_only["opportunities"]))
    status, sale = call("POST", "/sales", {"memberId": fm_id, "serviceId": "svc-diet"}, token=owner)
    check("sale recorded", sale["sale"]["amount"] > 0)
    status, services = call("GET", "/services", token=owner)
    check("services listed", len(services["services"]) >= 5)

    print("\nAttendance + notifications")
    status, att = call("GET", "/members/m-2/attendance", token=member_tok)
    check("attendance summary returned", isinstance(att["thisMonth"], int) and len(att["last30Days"]) == 30)
    expect_error("member cannot read other member attendance", lambda: call("GET", "/members/m-5/attendance", token=member_tok), 403)
    expect_error("member cannot read another member profile", lambda: call("GET", "/members/m-5", token=member_tok), 403)
    status, notifs = call("GET", "/notifications", token=owner)
    check("notifications list returned", "notifications" in notifs)
    status, att_sum = call("GET", "/attendance/summary", token=owner)
    check("attendance summary has averages", "averagePerMember" in att_sum)

    print("\nSettings (configurable risk thresholds)")
    status, settings = call("GET", "/settings", token=owner)
    check("default thresholds returned", settings["riskThresholds"] == {"activeMax": 4, "watchMax": 9, "atRiskMax": 14}, settings)
    expect_error("member cannot read settings", lambda: call("GET", "/settings", token=member_tok), 403)
    expect_error("non-increasing thresholds rejected", lambda: call("PATCH", "/settings", {"riskThresholds": {"activeMax": 5, "watchMax": 4, "atRiskMax": 14}}, token=owner), 400)
    status, before = call("GET", "/dashboard/risk-summary", token=owner)
    status, patched = call("PATCH", "/settings", {"riskThresholds": {"activeMax": 3, "watchMax": 7, "atRiskMax": 12}}, token=owner)
    check("thresholds updated", patched["riskThresholds"]["atRiskMax"] == 12)
    status, after = call("GET", "/dashboard/risk-summary", token=owner)
    check("tighter thresholds move members to critical", after["critical"] > before["critical"] and after["active"] < before["active"], (before, after))
    call("PATCH", "/settings", {"riskThresholds": {"activeMax": 4, "watchMax": 9, "atRiskMax": 14}}, token=owner)
    status, reset = call("GET", "/settings", token=owner)
    check("thresholds reset to defaults", reset["riskThresholds"]["watchMax"] == 9)

    print(f"\n{'+' if failures == 0 else '-'} {'ALL CHECKS PASSED' if failures == 0 else f'{failures} FAILED'}")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
