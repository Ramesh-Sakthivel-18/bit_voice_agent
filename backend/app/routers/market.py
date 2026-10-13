from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import logging
from app.services.market_assistant import process_market_query

router = APIRouter()
logger = logging.getLogger(__name__)

class MarketQueryRequest(BaseModel):
    query: str
    language: Optional[str] = "ta-IN"
    user_role: Optional[str] = "buyer"

class MarketQueryResponse(BaseModel):
    query_original: str
    query_english: str
    answer_english: str
    answer_localized: str
    sources: List[str]
    search_snippets_count: int

@router.post("/query", response_model=MarketQueryResponse)
async def handle_market_query(req: MarketQueryRequest):
    """
    Stateless Market Assistant Endpoint:
    - Receives user query in native language (e.g. Tamil) or English
    - Translates query to English
    - Executes live web search on Agmarknet / TRIFED
    - Directly passes search context into Gemini API prompt
    - Translates response to user's native language
    - Returns localized response for display and TTS speech
    """
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    try:
        result = process_market_query(
            raw_query=req.query.strip(),
            language=req.language or "en",
            user_role=req.user_role or "buyer"
        )
        return result
    except Exception as e:
        logger.error(f"Error handling market query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
