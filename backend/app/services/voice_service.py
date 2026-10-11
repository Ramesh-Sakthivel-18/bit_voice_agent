from groq import Groq
import os
import json
from app.core.config import settings
from gtts import gTTS
import io

groq_client = Groq(api_key=settings.GROQ_API_KEY)

def transcribe_audio(audio_file_path: str, language_code: str = "hi") -> str:
    """
    Transcribes the audio using Groq Whisper model.
    """
    with open(audio_file_path, "rb") as file:
        transcription = groq_client.audio.transcriptions.create(
            file=(os.path.basename(audio_file_path), file.read()),
            model="whisper-large-v3-turbo",
            prompt=f"The user is speaking in {language_code}.", # Providing hint
            response_format="verbose_json",
            temperature=0,
            language=language_code
        )
    return transcription.text

def parse_intent(transcript: str, expected_entity: str) -> str:
    """
    Uses LLM to extract clean entity value from transcript.
    """
    prompts = {
        "name": "Extract the person's name from this transcript. Return ONLY the name, nothing else.",
        "village": "Extract the village or city name from this transcript. Return ONLY the village name, nothing else.",
        "phone": "Extract the 10-digit phone number from this transcript. Return ONLY the digits, nothing else.",
        "role": "The user is choosing a role. Are they a 'buyer' or 'seller'? Return ONLY 'buyer' or 'seller'."
    }
    
    prompt = prompts.get(expected_entity, "Summarize the intent.")
    
    t_lower = transcript.strip().lower()
    if not t_lower or t_lower in ["my name is.", "my name is", "i am", "en peyar", "என் பெயர்", ""]:
        raise ValueError("Incomplete sentence. Please say your name clearly.")
        
    chat_completion = groq_client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": "You are a precise data extraction assistant. Follow the prompt exactly."
            },
            {
                "role": "user",
                "content": f"{prompt}\n\nTranscript: '{transcript}'"
            }
        ],
        model="openai/gpt-oss-20b",
    )
    
    extracted = chat_completion.choices[0].message.content.strip()
    
    if expected_entity == "phone":
        digits = ''.join(filter(str.isdigit, extracted))
        if len(digits) != 10:
            raise ValueError("Phone number must be exactly 10 digits.")
        extracted = digits
        
    return extracted

def generate_tts(text: str, lang: str = 'hi') -> bytes:
    """
    Generates TTS audio using gTTS as a fallback.
    Returns MP3 bytes.
    """
    tts = gTTS(text=text, lang=lang)
    fp = io.BytesIO()
    tts.write_to_fp(fp)
    fp.seek(0)
    return fp.read()
