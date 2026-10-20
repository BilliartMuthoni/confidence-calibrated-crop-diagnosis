from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.classifier import load_model
from app.core.config import settings
from app.core.limiter import limiter
from app.routers.admin import router as admin_router
from app.routers.admin_content import public_router as contacts_router
from app.routers.admin_content import router as admin_content_router
from app.routers.auth import router as auth_router
from app.routers.diagnosis import router as diagnosis_router
from app.routers.oauth import router as oauth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the model at startup so a missing model.pt fails now, not on the first photo.
    load_model()
    yield


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
