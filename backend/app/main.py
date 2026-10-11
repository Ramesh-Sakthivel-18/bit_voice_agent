from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, voice, commerce
from app.core.database import engine, Base
from app.models.listing import Listing
from app.models.interest import Interest
from app.models.order import Order
import logging

logging.basicConfig(level=logging.INFO)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Voice-First Platform API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development. Restrict in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(commerce.router, prefix="/api/commerce", tags=["commerce"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Voice-First Multi-Agent Platform API"}
