import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, voice, commerce, market
from app.core.database import engine, Base
from app.models.listing import Listing
from app.models.interest import Interest
from app.models.order import Order
import logging

logging.basicConfig(level=logging.INFO)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Voice-First Platform API")

from fastapi.responses import JSONResponse
from fastapi import Request

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"Global unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": {"error_code": "INTERNAL_SERVER_ERROR", "message": "An unexpected server error occurred."}}
    )

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(commerce.router, prefix="/api/commerce", tags=["commerce"])
app.include_router(market.router, prefix="/api/market", tags=["market"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Voice-First Multi-Agent Platform API"}
