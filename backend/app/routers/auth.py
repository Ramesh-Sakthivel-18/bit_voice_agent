from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import uuid
import numpy as np

from app.core.database import get_db
from app.models.user import User
from app.services.face_auth import get_face_embedding, compare_embeddings
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class FaceLoginRequest(BaseModel):
    image_base64: str

class FaceLoginResponse(BaseModel):
    status: str
    user: dict

class RegisterRequest(BaseModel):
    name: str
    village: str
    phone: str
    language: str
    role: str
    image_base64: str

@router.post("/face-login", response_model=FaceLoginResponse)
def face_login(request: FaceLoginRequest, db: Session = Depends(get_db)):
    try:
        incoming_embedding = get_face_embedding(request.image_base64)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Face login error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    # Fetch all users (in production, use localized search or vector DB like Qdrant/Milvus)
    users = db.query(User).all()
    
    best_match = None
    highest_score = -1.0

    for user in users:
        stored_embedding = np.frombuffer(user.face_embedding, dtype=np.float32)
        score = compare_embeddings(incoming_embedding, stored_embedding)
        
        if score > highest_score:
            highest_score = score
            best_match = user

    if best_match and highest_score >= settings.FACE_SIMILARITY_THRESHOLD:
        return {
            "status": "success",
            "user": {
                "user_id": best_match.user_id,
                "name": best_match.name,
                "role": best_match.role,
                "language": best_match.language,
                "village": best_match.village,
                "phone": best_match.phone,
                "confidence_score": highest_score
            }
        }
    
    raise HTTPException(status_code=401, detail={"error_code": "FACE_NOT_RECOGNIZED", "message": "Face did not match any registered users."})


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(request: RegisterRequest, db: Session = Depends(get_db)):
    try:
        embedding = get_face_embedding(request.image_base64)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check if phone already exists
    existing_user = db.query(User).filter(User.phone == request.phone).first()
    
    if existing_user:
        # Upsert: Update existing user's details and new face embedding
        existing_user.name = request.name
        existing_user.village = request.village
        existing_user.language = request.language
        existing_user.role = request.role
        existing_user.face_embedding = embedding.tobytes()
        
        db.commit()
        db.refresh(existing_user)
        
        return {
            "status": "success",
            "user_id": existing_user.user_id,
            "message": "User profile updated successfully."
        }
    else:
        # Create new user
        new_user = User(
            user_id=f"usr_{uuid.uuid4().hex[:8]}",
            name=request.name,
            village=request.village,
            phone=request.phone,
            language=request.language,
            role=request.role,
            face_embedding=embedding.tobytes()
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        return {
            "status": "success",
            "user_id": new_user.user_id,
            "message": "User registered successfully."
        }
