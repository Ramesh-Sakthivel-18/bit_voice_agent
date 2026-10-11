from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import os
import uuid
from app.services.voice_service import transcribe_audio, parse_intent, generate_tts
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class IntentRequest(BaseModel):
    transcript: str
    expected_entity: str
    context: str = ""

@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form("hi")):
    # Save the uploaded file temporarily
    temp_filename = f"temp_{uuid.uuid4().hex}.webm"
    temp_path = os.path.join(os.getcwd(), temp_filename)
    
    try:
        with open(temp_path, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)
            
        transcript = transcribe_audio(temp_path, language_code=language)
        
        return {
            "transcript": transcript,
            "duration_ms": 0 # Duration calculation can be added if needed
        }
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/parse-intent")
def get_intent(request: IntentRequest):
    print(f"\n[DEBUG] === Incoming Parse Intent Request ===")
    print(f"[DEBUG] Transcript: '{request.transcript}'")
    print(f"[DEBUG] Expected Entity: '{request.expected_entity}'")
    
    try:
        extracted_value = parse_intent(request.transcript, request.expected_entity)
        print(f"[DEBUG] Extracted Value: '{extracted_value}'")
        return {
            "extracted_value": extracted_value,
            "confidence": "high",
            "raw_matched": request.transcript
        }
    except Exception as e:
        logger.error(f"Intent parsing error: {e}")
        print(f"[DEBUG] Intent parsing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tts")
def tts_fallback(text: str, lang: str = 'hi'):
    try:
        audio_bytes = generate_tts(text, lang)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
