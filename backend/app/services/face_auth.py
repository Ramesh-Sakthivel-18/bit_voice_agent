import cv2
import numpy as np
import base64
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# InsightFace initialization is expensive, do it lazily or at startup.
app_insightface = None

def get_insightface_app():
    global app_insightface
    if app_insightface is None:
        try:
            from insightface.app import FaceAnalysis
            # CPU execution is safer for generic deployments
            app_insightface = FaceAnalysis(name='buffalo_sc', root='./models', providers=['CPUExecutionProvider'])
            app_insightface.prepare(ctx_id=-1, det_size=(640, 640))
            logger.info("InsightFace model loaded successfully.")
        except Exception as e:
            logger.error(f"Error loading InsightFace: {e}")
            raise RuntimeError("Face analysis model unavailable")
    return app_insightface

def get_face_embedding(image_base64: str) -> np.ndarray:
    if image_base64.startswith("data:image"):
        image_base64 = image_base64.split(",")[1]
    
    try:
        nparr = np.frombuffer(base64.b64decode(image_base64), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Invalid image data")
    except Exception:
        raise ValueError("Invalid image data format")

    face_app = get_insightface_app()
    faces = face_app.get(img)
    
    if len(faces) == 0:
        raise ValueError("NO_FACE_DETECTED")
    if len(faces) > 1:
        raise ValueError("MULTIPLE_FACES_DETECTED")
        
    face = faces[0]
    if face.det_score < 0.50:
        raise ValueError("LOW_CONFIDENCE_DETECTION")
        
    embedding = face.embedding
    embedding = embedding / np.linalg.norm(embedding)
    return embedding

def compare_embeddings(emb1: np.ndarray, emb2: np.ndarray) -> float:
    return float(np.dot(emb1, emb2))
