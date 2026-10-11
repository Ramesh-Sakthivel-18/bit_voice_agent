from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import logging

from app.core.database import get_db
from app.models.listing import Listing
from app.models.interest import Interest
from app.models.order import Order
from app.models.user import User
from app.services.voice_service import groq_client
from app.services.localization import (
    get_localized_prompt,
    get_localized_status,
    translate_dynamic_text,
    SUPPORTED_LANGUAGES
)

logger = logging.getLogger(__name__)

router = APIRouter()

class ValidateStepRequest(BaseModel):
    step: str # "name" | "quantity" | "price"
    transcript: str
    language: str

class SaveListingRequest(BaseModel):
    seller_id: str
    title: str
    quantity: float
    unit: str
    price_per_unit: float

class BuyerSearchRequest(BaseModel):
    query_transcript: str
    language: str

@router.post("/validate-step")
def validate_step(request: ValidateStepRequest):
    print(f"\n[DEBUG] === Validate Commerce Step ===")
    print(f"[DEBUG] Step: {request.step}")
    print(f"[DEBUG] Transcript: '{request.transcript}'")

    system_prompt = ""
    if request.step == "name":
        system_prompt = """You are a highly intelligent data extractor. The user is selling an agricultural or local product.
The transcript may be in English or a romanized native language (like Tanglish or Hinglish, e.g., 'manjal', 'thakkali', 'gehu').
YOUR JOB: Find the EXACT product name from the transcript. For example, if the transcript is "Nan mangel bitke verindi giren", the product is "mangel" (or "manjal" / turmeric).
If they clearly mention ANY product name, return JSON: {"is_valid": true, "extracted_data": {"title": "PRODUCT_NAME"}, "error_message": null}
If it is completely missing, return JSON: {"is_valid": false, "extracted_data": null, "retry_prompt": "Please tell me clearly what product you are selling."}
ONLY output valid JSON."""
    elif request.step == "quantity":
        system_prompt = """You are a highly intelligent data extractor. The user is stating how much they have to sell.
The transcript may be in English or a romanized native language.
You MUST extract a numeric quantity. If they also say a unit, extract it. If they only say a number (e.g. "100"), assume the unit is "units" or "kg" depending on context, and DO NOT reject it.
If they clearly state a number (e.g. "100", "10 kilos", "2 bags"), return JSON: {"is_valid": true, "extracted_data": {"quantity": 100.0, "unit": "units"}, "error_message": null}
If it is completely missing, return JSON: {"is_valid": false, "extracted_data": null, "retry_prompt": "Please specify the exact amount, for example 10 kg."}
ONLY output valid JSON."""
    elif request.step == "price":
        system_prompt = """You are a strict data validator. The user is stating their expected price per unit in rupees.
The transcript may be in English or a romanized native language.
You MUST extract a numeric price.
If they state a clear price (e.g. "50 rupees", "100", "50 rooba"), return JSON: {"is_valid": true, "extracted_data": {"price": 50.0}, "error_message": null}
If they are vague (e.g. "good price", "market rate"), do NOT guess. Return JSON: {"is_valid": false, "extracted_data": null, "retry_prompt": "Please tell me your exact price in rupees."}
ONLY output valid JSON."""
    else:
        raise HTTPException(status_code=400, detail="Invalid step")

    try:
        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.transcript}
            ],
            model="openai/gpt-oss-20b",
            response_format={"type": "json_object"}
        )
        
        result_json = json.loads(completion.choices[0].message.content)
        print(f"[DEBUG] Validation Result: {result_json}")
        return result_json
        
    except Exception as e:
        logger.error(f"Validation Error: {e}")
        # Graceful fallback on LLM crash
        return {"is_valid": False, "extracted_data": None, "retry_prompt": "I didn't quite catch that. Please say it again clearly."}

@router.post("/seller/save")
def save_listing(request: SaveListingRequest, db: Session = Depends(get_db)):
    print(f"\n[DEBUG] === Saving Listing ===")
    
    # 1. Verify Seller Exists
    seller = db.query(User).filter(User.user_id == request.seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
        
    # 2. AI Background Enrichment
    enrichment_prompt = f"""
    The user is selling: {request.title} (Qty: {request.quantity} {request.unit}).
    Generate a JSON response containing:
    1. 'description': A 2-sentence rich, appealing description highlighting organic/natural qualities.
    2. 'search_tags': A comma-separated list of 10 keywords/synonyms to help buyers find this. Include terms in BOTH English and Tamil (e.g. 'turmeric, manjal, மஞ்சள்').
    ONLY output valid JSON.
    """
    
    try:
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": enrichment_prompt}],
            model="openai/gpt-oss-20b",
            response_format={"type": "json_object"}
        )
        enrichment = json.loads(completion.choices[0].message.content)
        description = enrichment.get("description", "A high-quality product direct from the seller.")
        search_tags = enrichment.get("search_tags", request.title)
    except Exception as e:
        logger.error(f"Enrichment Error: {e}")
        description = "A high-quality product direct from the seller."
        search_tags = request.title

    # 3. Save to SQLite
    total_price = request.quantity * request.price_per_unit
    
    new_listing = Listing(
        seller_id=request.seller_id,
        title=request.title,
        quantity=request.quantity,
        unit=request.unit,
        price_per_unit=request.price_per_unit,
        total_price=total_price,
        description=description,
        search_tags=search_tags,
        status="ACTIVE"
    )
    
    db.add(new_listing)
    db.commit()
    db.refresh(new_listing)
    
    print(f"[DEBUG] Listing Saved! ID: {new_listing.id}")
    return {"status": "success", "listing_id": new_listing.id}

from sqlalchemy import or_

@router.post("/buyer/search")
def search_listings(request: BuyerSearchRequest, db: Session = Depends(get_db)):
    print(f"\n[DEBUG] === Buyer Search ===")
    print(f"[DEBUG] Query: '{request.query_transcript}'")
    
    # 1. LLM extracts core concepts in both languages
    extract_prompt = f"""
    The buyer is searching for something: "{request.query_transcript}"
    Extract the core item they are looking for.
    Provide the keyword translated into BOTH English AND Tamil. Return as a JSON list of strings.
    Example JSON: {{"keywords": ["honey", "தேன்"]}}
    """
    
    try:
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": extract_prompt}],
            model="openai/gpt-oss-20b",
            response_format={"type": "json_object"}
        )
        extraction = json.loads(completion.choices[0].message.content)
        keywords = extraction.get("keywords", [])
        if not keywords:
            keywords = [request.query_transcript.lower()]
    except Exception as e:
        logger.error(f"Search Extraction Error: {e}")
        keywords = [request.query_transcript.lower()]
        
    print(f"[DEBUG] Search Keywords: {keywords}")
    
    # 2. SQLite Search
    # We will build an OR condition for all keywords across title, description, and search_tags
    search_conditions = []
    for kw in keywords:
        search_term = f"%{kw.strip()}%"
        search_conditions.append(Listing.title.ilike(search_term))
        search_conditions.append(Listing.search_tags.ilike(search_term))
        search_conditions.append(Listing.description.ilike(search_term))
        
    results = db.query(Listing).filter(
        Listing.status == "ACTIVE",
        or_(*search_conditions)
    ).all()
    
    # Format results to include seller details
    formatted_results = []
    for r in results:
        seller = db.query(User).filter(User.user_id == r.seller_id).first()
        formatted_results.append({
            "id": r.id,
            "title": r.title,
            "quantity": r.quantity,
            "unit": r.unit,
            "price_per_unit": r.price_per_unit,
            "total_price": r.total_price,
            "description": r.description,
            "seller_name": seller.name if seller else "Unknown",
            "seller_village": seller.village if seller else "Unknown",
            "seller_phone": seller.phone if seller else ""
        })
        
    if formatted_results:
        print(f"[DEBUG] Translating {len(formatted_results)} results to {request.language}...")
        target_lang = "Tamil" if request.language == "ta-IN" else "English"
        try:
            # Only send the fields that need translation to prevent name mangling
            to_translate = []
            for r in formatted_results:
                to_translate.append({
                    "id": r["id"],
                    "title": r["title"],
                    "unit": r["unit"],
                    "description": r["description"]
                })

            translation_prompt = f"""
            You are a strict translation API.
            Translate the 'title', 'unit', and 'description' fields of these listings into {target_lang}.
            Return a JSON object with a single key "translated_results" containing the translated array.
            Data: {json.dumps(to_translate)}
            """
            completion = groq_client.chat.completions.create(
                messages=[{"role": "user", "content": translation_prompt}],
                model="openai/gpt-oss-20b",
                response_format={"type": "json_object"}
            )
            translated_data = json.loads(completion.choices[0].message.content)
            if "translated_results" in translated_data:
                # Merge translated fields back into original results
                translations = { item.get("id"): item for item in translated_data["translated_results"] }
                for i in range(len(formatted_results)):
                    t_id = formatted_results[i]["id"]
                    if t_id in translations:
                        formatted_results[i]["title"] = translations[t_id].get("title", formatted_results[i]["title"])
                        formatted_results[i]["unit"] = translations[t_id].get("unit", formatted_results[i]["unit"])
                        formatted_results[i]["description"] = translations[t_id].get("description", formatted_results[i]["description"])
                print("[DEBUG] Translation successful.")
        except Exception as e:
            logger.error(f"Search Translation Error: {e}")
            
    print(f"[DEBUG] Returning {len(formatted_results)} results.")
    return {"results": formatted_results}

@router.get("/seller/listings/{seller_id}")
def get_seller_listings(seller_id: str, db: Session = Depends(get_db)):
    print(f"\n[DEBUG] === Fetching Listings for Seller: {seller_id} ===")
    
    results = db.query(Listing).filter(Listing.seller_id == seller_id).order_by(Listing.id.desc()).all()
    
    formatted_results = []
    for r in results:
        # Fetch interested buyers
        interests = db.query(Interest).filter(Interest.listing_id == r.id).all()
        interested_buyers = []
        for i in interests:
            buyer = db.query(User).filter(User.user_id == i.buyer_id).first()
            if buyer:
                interested_buyers.append({
                    "name": buyer.name,
                    "phone": buyer.phone,
                    "village": buyer.village
                })

        formatted_results.append({
            "id": r.id,
            "title": r.title,
            "quantity": r.quantity,
            "unit": r.unit,
            "price_per_unit": r.price_per_unit,
            "total_price": r.total_price,
            "status": r.status,
            "description": r.description,
            "interested_buyers": interested_buyers
        })
        
    return {"listings": formatted_results}

class ExpressInterestRequest(BaseModel):
    buyer_id: str
    listing_id: int

@router.post("/buyer/interest")
def express_interest(request: ExpressInterestRequest, db: Session = Depends(get_db)):
    print(f"\n[DEBUG] === Buyer Expressing Interest ===")
    print(f"[DEBUG] Buyer ID: {request.buyer_id} is interested in Listing ID: {request.listing_id}")
    
    listing = db.query(Listing).filter(Listing.id == request.listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
        
    existing_interest = db.query(Interest).filter(
        Interest.buyer_id == request.buyer_id, 
        Interest.listing_id == request.listing_id
    ).first()
    
    if not existing_interest:
        new_interest = Interest(buyer_id=request.buyer_id, listing_id=request.listing_id)
        db.add(new_interest)
        db.commit()
        
    return {"status": "success", "message": "Interest registered successfully"}
