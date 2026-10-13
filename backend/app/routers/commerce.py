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
    translate_to_english,
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
        
    # 2. Translate voice term to standard English tokens for SQLite persistence
    english_title = translate_to_english(request.title)
    english_unit = "kg" if ("கிலோ" in request.unit or "kilo" in request.unit.lower()) else request.unit
    
    # 3. AI Background Enrichment in English
    enrichment_prompt = f"""
    The user is selling: {english_title} (Original spoken title: {request.title}, Qty: {request.quantity} {english_unit}).
    Generate a JSON response containing:
    1. 'description': A 2-sentence rich, appealing description in English highlighting organic/natural qualities.
    2. 'search_tags': A comma-separated list of 10 keywords/synonyms to help buyers find this. Include terms in BOTH English and regional languages (e.g. 'turmeric, manjal, மஞ்சள், haldi').
    ONLY output valid JSON.
    """
    
    try:
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": enrichment_prompt}],
            model="openai/gpt-oss-20b",
            response_format={"type": "json_object"}
        )
        enrichment = json.loads(completion.choices[0].message.content)
        description = enrichment.get("description", f"Fresh, authentic {english_title} harvested by local tribal farmers.")
        search_tags = enrichment.get("search_tags", f"{english_title}, {request.title}")
    except Exception as e:
        logger.error(f"Enrichment Error: {e}")
        description = f"Fresh, authentic {english_title} harvested by local tribal farmers."
        search_tags = f"{english_title}, {request.title}"

    # 4. Save to SQLite strictly in English
    total_price = request.quantity * request.price_per_unit
    
    new_listing = Listing(
        seller_id=request.seller_id,
        title=english_title, # Strictly in English
        quantity=request.quantity,
        unit=english_unit,
        price_per_unit=request.price_per_unit,
        total_price=total_price,
        description=description, # Strictly in English
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
        
    if formatted_results and request.language not in ["en-IN", "en", "en-US"]:
        target_lang = SUPPORTED_LANGUAGES.get(request.language, "Tamil")
        print(f"[DEBUG] Translating {len(formatted_results)} results to {target_lang} ({request.language})...")
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
            Translate the 'title', 'unit', and 'description' fields of these agricultural listings into {target_lang}.
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
def get_seller_listings(seller_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    print(f"\n[DEBUG] === Fetching Listings for Seller: {seller_id} (Language: {language}) ===")
    
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

    # Dynamically translate listing text into seller's native language if non-English
    if formatted_results and language and language not in ["en-IN", "en", "en-US"]:
        target_lang = SUPPORTED_LANGUAGES.get(language, "Tamil")
        try:
            to_translate = [{"id": r["id"], "title": r["title"], "unit": r["unit"], "description": r["description"]} for r in formatted_results]
            translation_prompt = f"""
            Translate 'title', 'unit', and 'description' of these listings into {target_lang}.
            Return JSON: {{"translated_results": [...]}}
            Data: {json.dumps(to_translate)}
            """
            completion = groq_client.chat.completions.create(
                messages=[{"role": "user", "content": translation_prompt}],
                model="openai/gpt-oss-20b",
                response_format={"type": "json_object"}
            )
            translated_data = json.loads(completion.choices[0].message.content)
            if "translated_results" in translated_data:
                translations = { item.get("id"): item for item in translated_data["translated_results"] }
                for i in range(len(formatted_results)):
                    t_id = formatted_results[i]["id"]
                    if t_id in translations:
                        formatted_results[i]["title"] = translations[t_id].get("title", formatted_results[i]["title"])
                        formatted_results[i]["unit"] = translations[t_id].get("unit", formatted_results[i]["unit"])
                        formatted_results[i]["description"] = translations[t_id].get("description", formatted_results[i]["description"])
        except Exception as e:
            logger.error(f"Seller listing translation error: {e}")
        
    return {"listings": formatted_results}

class CreateOrderInterestRequest(BaseModel):
    buyer_id: str
    listing_id: int
    language: Optional[str] = "ta-IN"

class AcceptOrderRequest(BaseModel):
    order_id: int
    seller_id: str
    language: Optional[str] = "ta-IN"

class PayOrderRequest(BaseModel):
    order_id: int
    buyer_id: str
    language: Optional[str] = "ta-IN"

@router.post("/buyer/interest")
@router.post("/order/interest")
def express_buyer_interest(request: CreateOrderInterestRequest, db: Session = Depends(get_db)):
    """
    Step 1 (Buyer Interest): When a buyer searches for a product and expresses interest,
    create an order record in SQLite with status strictly in English: 'interest_expressed'.
    """
    print(f"\n[DEBUG] === Step 1: Buyer Expressing Interest ===")
    print(f"[DEBUG] Buyer ID: {request.buyer_id} interested in Listing ID: {request.listing_id}")
    
    listing = db.query(Listing).filter(Listing.id == request.listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
        
    buyer = db.query(User).filter(User.user_id == request.buyer_id).first()
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")

    # Maintain existing Interest record
    existing_interest = db.query(Interest).filter(
        Interest.buyer_id == request.buyer_id, 
        Interest.listing_id == request.listing_id
    ).first()
    if not existing_interest:
        new_interest = Interest(buyer_id=request.buyer_id, listing_id=request.listing_id)
        db.add(new_interest)
        db.commit()

    # Create Order record with strictly English status 'interest_expressed'
    existing_order = db.query(Order).filter(
        Order.buyer_id == request.buyer_id,
        Order.listing_id == request.listing_id,
        Order.status == "interest_expressed"
    ).first()

    if existing_order:
        order = existing_order
    else:
        order = Order(
            listing_id=listing.id,
            seller_id=listing.seller_id,
            buyer_id=request.buyer_id,
            status="interest_expressed", # Strictly in English
            item_title=listing.title,
            quantity=listing.quantity or 1.0,
            unit=listing.unit or "units",
            unit_price=listing.price_per_unit or 0.0,
            total_amount=listing.total_price or ((listing.quantity or 1.0) * (listing.price_per_unit or 0.0))
        )
        db.add(order)
        db.commit()
        db.refresh(order)

    logger.info(f"Order #{order.id} registered: Buyer '{request.buyer_id}' -> Listing #{listing.id}. Status: interest_expressed")
    
    localized_prompt = get_localized_prompt("buyer_interest_recorded", request.language)
    localized_status = get_localized_status(order.status, request.language)

    return {
        "status": "success",
        "order_id": order.id,
        "order_status": order.status, # Strictly English
        "status_localized": localized_status,
        "voice_prompt": localized_prompt,
        "item_title": order.item_title,
        "total_amount": order.total_amount
    }

@router.get("/orders/seller/pending/{seller_id}")
def get_seller_pending_orders(seller_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Step 2 (Seller Notification): When a seller logs in, check SQLite for records matching
    their items where status is 'interest_expressed'. Trigger voice notification in their language:
    'You have a buyer interested. Say 'Accept' to invite.'
    """
    print(f"\n[DEBUG] === Step 2: Checking Pending Orders for Seller: {seller_id} ===")
    
    orders = db.query(Order).filter(
        Order.seller_id == seller_id,
        Order.status == "interest_expressed"
    ).order_by(Order.id.desc()).all()
    
    results = []
    for o in orders:
        buyer = db.query(User).filter(User.user_id == o.buyer_id).first()
        results.append({
            "order_id": o.id,
            "listing_id": o.listing_id,
            "seller_id": o.seller_id,
            "buyer_id": o.buyer_id,
            "buyer_name": buyer.name if buyer else "Buyer",
            "buyer_village": buyer.village if buyer else "",
            "buyer_phone": buyer.phone if buyer else "",
            "item_title": o.item_title,
            "quantity": o.quantity,
            "unit": o.unit,
            "unit_price": o.unit_price,
            "total_amount": o.total_amount,
            "status": o.status, # Strictly English
            "status_localized": get_localized_status(o.status, language),
            "created_at": o.created_at.isoformat() if o.created_at else None
        })
        
    voice_notification = get_localized_prompt("seller_buyer_interested", language)
    
    return {
        "count": len(results),
        "orders": results,
        "voice_notification": voice_notification if len(results) > 0 else ""
    }

@router.post("/order/accept")
def accept_order(request: AcceptOrderRequest, db: Session = Depends(get_db)):
    """
    Step 2 (Seller Acceptance): When the seller says 'Accept', update status to 'invitation_accepted'.
    """
    print(f"\n[DEBUG] === Step 2: Seller Accepting Order #{request.order_id} ===")
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.seller_id != request.seller_id:
        raise HTTPException(status_code=403, detail="Unauthorized: Not the seller for this order")
        
    order.status = "invitation_accepted" # Strictly in English
    db.commit()
    db.refresh(order)
    
    logger.info(f"Order #{order.id}: Seller '{request.seller_id}' accepted. Status: invitation_accepted")
    
    localized_prompt = get_localized_prompt("seller_invitation_accepted", request.language)
    localized_status = get_localized_status(order.status, request.language)
    
    return {
        "status": "success",
        "order_id": order.id,
        "order_status": order.status, # Strictly English
        "status_localized": localized_status,
        "voice_prompt": localized_prompt
    }

@router.get("/order/{order_id}")
def get_order_status(order_id: int, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Get current order status with strict English status and localized UI/voice representations.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    seller = db.query(User).filter(User.user_id == order.seller_id).first()
    buyer = db.query(User).filter(User.user_id == order.buyer_id).first()
    
    voice_prompt = ""
    if order.status == "invitation_accepted":
        voice_prompt = get_localized_prompt("buyer_checkout_prompt", language, amount=order.total_amount)
    elif order.status in ["order_confirmed", "processing", "payment_paid"]:
        voice_prompt = get_localized_prompt("payment_paid_buyer", language, amount=order.total_amount)
        
    return {
        "order_id": order.id,
        "listing_id": order.listing_id,
        "seller_id": order.seller_id,
        "seller_name": seller.name if seller else "Seller",
        "seller_village": seller.village if seller else "",
        "seller_phone": seller.phone if seller else "",
        "buyer_id": order.buyer_id,
        "buyer_name": buyer.name if buyer else "Buyer",
        "buyer_village": buyer.village if buyer else "",
        "buyer_phone": buyer.phone if buyer else "",
        "item_title": order.item_title,
        "quantity": order.quantity,
        "unit": order.unit,
        "unit_price": order.unit_price,
        "total_amount": order.total_amount,
        "status": order.status, # Strictly English
        "status_localized": get_localized_status(order.status, language),
        "voice_prompt": voice_prompt,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None
    }

@router.get("/orders/buyer/active/{buyer_id}")
def get_buyer_active_orders(buyer_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Returns active orders for buyer (interest_expressed, invitation_accepted, order_confirmed, processing).
    """
    orders = db.query(Order).filter(Order.buyer_id == buyer_id).order_by(Order.id.desc()).all()
    results = []
    for o in orders:
        seller = db.query(User).filter(User.user_id == o.seller_id).first()
        results.append({
            "order_id": o.id,
            "listing_id": o.listing_id,
            "seller_id": o.seller_id,
            "seller_name": seller.name if seller else "Seller",
            "seller_village": seller.village if seller else "",
            "seller_phone": seller.phone if seller else "",
            "item_title": o.item_title,
            "quantity": o.quantity,
            "unit": o.unit,
            "unit_price": o.unit_price,
            "total_amount": o.total_amount,
            "status": o.status,
            "status_localized": get_localized_status(o.status, language),
            "created_at": o.created_at.isoformat() if o.created_at else None
        })
    return {"orders": results}

@router.post("/order/pay")
def pay_order(request: PayOrderRequest, db: Session = Depends(get_db)):
    """
    Step 3 & 4 (Payment & Order Confirmation):
    Upon completing the 10-second payment timer, transitions status to 'payment_paid'.
    Automatically advances status to 'order_confirmed' and 'processing'.
    Simultaneously provides data for seller dashboard to show 'Amount Received' + audio confirmation.
    """
    print(f"\n[DEBUG] === Steps 3 & 4: Processing Payment for Order #{request.order_id} ===")
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.buyer_id != request.buyer_id:
        raise HTTPException(status_code=403, detail="Unauthorized: Not the buyer for this order")
        
    # Strictly English state advance: payment_paid -> order_confirmed (processing)
    order.status = "order_confirmed" # Auto-advanced from payment_paid to order_confirmed and processing
    db.commit()
    db.refresh(order)
    
    logger.info(f"Order #{order.id}: Payment received (₹{order.total_amount}). Advanced to 'order_confirmed' & 'processing'.")
    
    buyer_voice_prompt = get_localized_prompt("payment_paid_buyer", request.language, amount=order.total_amount)
    seller_voice_prompt = get_localized_prompt("seller_amount_received", request.language, amount=order.total_amount, item_title=order.item_title)
    localized_status = get_localized_status(order.status, request.language)
    
    return {
        "status": "success",
        "order_id": order.id,
        "order_status": order.status, # Strictly English ('order_confirmed')
        "status_localized": localized_status,
        "total_amount": order.total_amount,
        "buyer_voice_prompt": buyer_voice_prompt,
        "seller_voice_prompt": seller_voice_prompt
    }

@router.get("/orders/seller/confirmed/{seller_id}")
def get_seller_confirmed_orders(seller_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Step 4 (Seller View): Returns orders with 'order_confirmed' or 'processing' or 'payment_paid'
    so seller dashboard displays 'Amount Received' and triggers audio confirmation prompt.
    """
    orders = db.query(Order).filter(
        Order.seller_id == seller_id,
        Order.status.in_(["payment_paid", "order_confirmed", "processing"])
    ).order_by(Order.id.desc()).all()
    
    results = []
    for o in orders:
        buyer = db.query(User).filter(User.user_id == o.buyer_id).first()
        audio_prompt = get_localized_prompt("seller_amount_received", language, amount=o.total_amount, item_title=o.item_title)
        results.append({
            "order_id": o.id,
            "listing_id": o.listing_id,
            "buyer_id": o.buyer_id,
            "buyer_name": buyer.name if buyer else "Buyer",
            "buyer_village": buyer.village if buyer else "",
            "buyer_phone": buyer.phone if buyer else "",
            "item_title": o.item_title,
            "quantity": o.quantity,
            "unit": o.unit,
            "total_amount": o.total_amount,
            "amount_received_display": f"₹{o.total_amount}",
            "status": o.status, # Strictly English
            "status_localized": get_localized_status(o.status, language),
            "audio_confirmation_prompt": audio_prompt,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None
        })
        
    return {
        "count": len(results),
        "confirmed_orders": results
    }

@router.get("/screen-instruction")
def get_screen_instruction(screen: str, language: Optional[str] = "ta-IN"):
    """
    Returns localized screen instructions for Single-Tap TTS interaction.
    """
    prompt_key = f"screen_{screen}"
    text = get_localized_prompt(prompt_key, language)
    return {"screen": screen, "language": language, "instruction": text}
