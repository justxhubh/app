import os

# PostgreSQL connection. Override with DATABASE_URL if your setup differs.
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://shubham@127.0.0.1:5432/gymos",
)

# Origins allowed to call the API (Expo web dev server).
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:8081").split(",")

# Demo OTP used for phone+OTP login (send-otp always returns this).
DEMO_OTP = "1234"

# Duplicate check-in window (minutes).
CHECKIN_DUPLICATE_MINUTES = 30

# Access / refresh token lifetimes.
ACCESS_TOKEN_DAYS = 1
REFRESH_TOKEN_DAYS = 14
