import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.classifier import load_model
from app.core.leaf_check import load_leaf_check
from app.core.config import settings
from app.core.limiter import limiter
from app.core.retention import delete_old_photos
from app.db.session import SessionLocal
from app.routers.admin import router as admin_router
from app.routers.admin_content import public_router as contacts_router
from app.routers.admin_content import router as admin_content_router
from app.routers.auth import router as auth_router
from app.routers.diagnosis import router as diagnosis_router
from app.routers.oauth import router as oauth_router


PHOTO_CLEANUP_SECONDS = 3600


def _delete_old_photos_once() -> None:
    db = SessionLocal()
    try:
        delete_old_photos(db)
    except Exception as err:  # a failed clean-up must never stop the API; it runs again next hour
        logging.getLogger("sproutly").warning("Photo clean-up failed: %s", err)
    finally:
        db.close()


async def _photo_cleanup_loop() -> None:
    while True:
        await run_in_threadpool(_delete_old_photos_once)
        await asyncio.sleep(PHOTO_CLEANUP_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the models at startup so a missing file fails now, not on the first photo.
    load_model()
    load_leaf_check()
    # Farmers' photos are deleted after PHOTO_DAYS (app/core/retention.py): now, then every hour.
    cleanup = asyncio.create_task(_photo_cleanup_loop())
    yield
    cleanup.cancel()


#create a web server
app = FastAPI(lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(diagnosis_router)
app.include_router(oauth_router)
# Admin and officer portal (role-checked on every route) and the farmers' contacts list.
app.include_router(admin_router)
app.include_router(admin_content_router)
app.include_router(contacts_router)

@app.get("/")
def message():
    print("Server running")
    return("Server running")
