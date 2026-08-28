from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from .config import CORS_ORIGINS
from .db import Base, SessionLocal, engine
from .models import Gym
from .routers import router


# Columns added after the initial release — create_all() won't alter existing
# tables, so add them explicitly (idempotent; existing rows get the defaults).
def ensure_columns() -> None:
    additions = {
        "risk_active_max": 4,
        "risk_watch_max": 9,
        "risk_at_risk_max": 14,
    }
    with engine.connect() as conn:
        for col, default in additions.items():
            conn.execute(
                text(
                    f"ALTER TABLE gyms ADD COLUMN IF NOT EXISTS "
                    f"{col} INTEGER NOT NULL DEFAULT {default}"
                )
            )
        conn.commit()


def ensure_seeded() -> None:
    with SessionLocal() as db:
        if db.scalar(select(Gym)) is None:
            from .seed import seed

            seed(db)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    ensure_columns()
    ensure_seeded()
    yield


app = FastAPI(title="Gym OS API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
def health():
    return {"ok": True, "service": "gym-os-api"}
