import os
from dotenv import load_dotenv

# Load from root directory
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), ".env")
load_dotenv(env_path)

class Settings:
    PROJECT_NAME: str = "Voice-First Multi-Agent Platform"
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY") or os.getenv("groq_api_key", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY") or os.getenv("gemini_api_key", "")
    DATABASE_URL: str = "sqlite:///./voice_agent.db"
    FACE_SIMILARITY_THRESHOLD: float = 0.60

settings = Settings()
