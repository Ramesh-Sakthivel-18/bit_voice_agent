from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import logging

from app.core.database import get_db
from app.models.listing import Listing
from app.models.interest import Interest
from app.models.order import Order, OrderItem, OrderHistory, History
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

def _format_and_translate_listings(results, language: Optional[str], db: Session) -> List[Dict[str, Any]]:
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
            "search_tags": r.search_tags or "",
            "seller_name": seller.name if seller else "Unknown",
            "seller_village": seller.village if seller else "Unknown",
            "seller_phone": seller.phone if seller else ""
        })
        
    if formatted_results and language and language not in ["en-IN", "en", "en-US"]:
        target_lang = SUPPORTED_LANGUAGES.get(language, "Tamil")
        print(f"[DEBUG] Translating {len(formatted_results)} listings to {target_lang} ({language})...")
        try:
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
                translations = {}
                for item in translated_data["translated_results"]:
                    if "id" in item:
                        translations[str(item["id"])] = item
                        try:
                            translations[int(item["id"])] = item
                        except (ValueError, TypeError):
                            pass
                for i in range(len(formatted_results)):
                    t_id = formatted_results[i]["id"]
                    t_entry = translations.get(t_id) or translations.get(str(t_id))
                    if t_entry:
                        formatted_results[i]["title"] = t_entry.get("title", formatted_results[i]["title"])
                        formatted_results[i]["unit"] = t_entry.get("unit", formatted_results[i]["unit"])
                        formatted_results[i]["description"] = t_entry.get("description", formatted_results[i]["description"])
                print("[DEBUG] Translation applied successfully.")
        except Exception as e:
            logger.error(f"Listings Translation Error: {e}")

        # Fallback guarantee for Tamil
        if language.startswith("ta"):
            for r in formatted_results:
                title_lower = r["title"].lower()
                if "wild forest honey" in title_lower or "forest honey" in title_lower:
                    r["title"] = "இயற்கை காட்டு தேன்"
                elif "honey" in title_lower:
                    r["title"] = "சுத்தமான தேன்"
                elif "organic turmeric" in title_lower:
                    r["title"] = "இயற்கை மஞ்சள்"
                elif "turmeric" in title_lower:
                    r["title"] = "நாட்டு மஞ்சள்"
                
                if r["unit"].lower() in ["kg", "kgs", "kilo"]:
                    r["unit"] = "கிலோ"
                elif r["unit"].lower() in ["grams", "g", "gm"]:
                    r["unit"] = "கிராம்"
            
    return formatted_results

@router.get("/buyer/all-listings")
def get_all_buyer_listings(language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    print(f"\n[DEBUG] === Fetching All Buyer Listings (Language: {language}) ===")
    results = db.query(Listing).filter(Listing.status == "ACTIVE").order_by(Listing.id.desc()).all()
    formatted = _format_and_translate_listings(results, language, db)
    print(f"[DEBUG] Returning {len(formatted)} total listings.")
    return {"results": formatted}

@router.post("/buyer/search")
def search_listings(request: BuyerSearchRequest, db: Session = Depends(get_db)):
    query = (request.query_transcript or "").strip()
    print(f"\n[DEBUG] === Buyer Search ===")
    print(f"[DEBUG] Query: '{query}', Language: '{request.language}'")
    
    # If query is empty or asking for all products, return all active listings
    if not query or query.lower() in ["all", "everything", "அனைத்தும்", "எல்லாம்", "பொருட்கள்", "பொருட்கள் அனைத்தும்", "items", "products"]:
        results = db.query(Listing).filter(Listing.status == "ACTIVE").order_by(Listing.id.desc()).all()
        formatted = _format_and_translate_listings(results, request.language, db)
        return {"results": formatted}

    # 1. LLM extracts core concepts in both languages
    extract_prompt = f"""
    The buyer is searching for something: "{query}"
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
            keywords = [query.lower()]
    except Exception as e:
        logger.error(f"Search Extraction Error: {e}")
        keywords = [query.lower()]
        
    print(f"[DEBUG] Search Keywords: {keywords}")
    
    # 2. SQLite Search
    search_conditions = []
    for kw in keywords:
        search_term = f"%{kw.strip()}%"
        search_conditions.append(Listing.title.ilike(search_term))
        search_conditions.append(Listing.search_tags.ilike(search_term))
        search_conditions.append(Listing.description.ilike(search_term))
        
    results = db.query(Listing).filter(
        Listing.status == "ACTIVE",
        or_(*search_conditions)
    ).order_by(Listing.id.desc()).all()
    
    formatted = _format_and_translate_listings(results, request.language, db)
    print(f"[DEBUG] Returning {len(formatted)} filtered results.")
    return {"results": formatted}

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

# ─── E-COMMERCE LIFECYCLE REQUEST MODELS ───
class CreateDirectOrderRequest(BaseModel):
    buyer_id: str
    listing_id: int
    quantity: float = 1.0
    language: Optional[str] = "ta-IN"

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

class PackOrderRequest(BaseModel):
    order_id: int
    seller_id: str
    language: Optional[str] = "ta-IN"

class SchedulePickupRequest(BaseModel):
    order_id: int
    seller_id: str
    language: Optional[str] = "ta-IN"

class DispatchOrderRequest(BaseModel):
    order_id: int
    language: Optional[str] = "ta-IN"

class ReceiveOrderRequest(BaseModel):
    order_id: int
    user_id: str
    language: Optional[str] = "ta-IN"


# ─── 1. BUYER ORDER PLACEMENT (BUY NOW WITH QUANTITY SELECTOR) ───
@router.post("/order/create")
@router.post("/buyer/buy-now")
def create_direct_order(request: CreateDirectOrderRequest, db: Session = Depends(get_db)):
    """
    E-commerce direct purchase flow: Creates an order with exact requested quantity,
    calculates total amount, and records entries in orders, order_items, and order_history strictly in English.
    """
    print(f"\n[DEBUG] === Buyer Buy Now: Buyer {request.buyer_id} ordering Listing #{request.listing_id} (Qty: {request.quantity}) ===")
    listing = db.query(Listing).filter(Listing.id == request.listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
        
    buyer = db.query(User).filter(User.user_id == request.buyer_id).first()
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")

    qty = max(0.1, float(request.quantity))
    if qty > (listing.quantity or 1.0):
        qty = float(listing.quantity or 1.0) # Cap at available stock

    unit_price = float(listing.price_per_unit or 0.0)
    total_amount = round(qty * unit_price, 2)

    # 1. Store in orders table strictly in English
    order = Order(
        listing_id=listing.id,
        seller_id=listing.seller_id,
        buyer_id=request.buyer_id,
        status="order_placed", # Strictly English
        item_title=listing.title, # Strictly English
        quantity=qty,
        unit=listing.unit or "kg", # Strictly English
        unit_price=unit_price,
        total_amount=total_amount
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # 2. Store in order_items table strictly in English
    order_item = OrderItem(
        order_id=order.id,
        listing_id=listing.id,
        item_title=listing.title,
        quantity=qty,
        unit=listing.unit or "kg",
        unit_price=unit_price,
        total_price=total_amount
    )
    db.add(order_item)

    # 3. Store in order_history table strictly in English
    order_hist = OrderHistory(
        order_id=order.id,
        status="order_placed",
        action="Order Placed",
        notes=f"Buyer {buyer.name} placed order for {qty} {listing.unit} for INR {total_amount}"
    )
    db.add(order_hist)

    # 4. Store in generic history table
    hist = History(
        entity_type="order",
        entity_id=order.id,
        action="Order Placed",
        details=f"Order #{order.id} placed: {qty} {listing.unit} of {listing.title}"
    )
    db.add(hist)
    db.commit()

    seller = db.query(User).filter(User.user_id == listing.seller_id).first()
    localized_status = get_localized_status(order.status, request.language)
    
    voice_prompt = (
        f"{listing.title}-க்கான {qty} {listing.unit} ஆர்டர் வைக்கப்பட்டது. மொத்த தொகை ₹{total_amount}. பணம் செலுத்த தொடரவும்."
        if (request.language and request.language.startswith("ta"))
        else f"Order for {qty} {listing.unit} of {listing.title} placed. Total: ₹{total_amount}. Proceed to payment."
    )

    return {
        "status": "success",
        "order_id": order.id,
        "listing_id": order.listing_id,
        "seller_id": order.seller_id,
        "seller_name": seller.name if seller else "Producer",
        "seller_village": seller.village if seller else "",
        "seller_phone": seller.phone if seller else "",
        "buyer_id": order.buyer_id,
        "buyer_name": buyer.name,
        "item_title": order.item_title,
        "quantity": order.quantity,
        "unit": order.unit,
        "unit_price": order.unit_price,
        "total_amount": order.total_amount,
        "order_status": order.status,
        "status_localized": localized_status,
        "voice_prompt": voice_prompt
    }

# Backward compatible alias for interest
@router.post("/buyer/interest")
@router.post("/order/interest")
def express_buyer_interest(request: CreateOrderInterestRequest, db: Session = Depends(get_db)):
    """Backward compatibility wrapper that routes to direct order creation."""
    direct_req = CreateDirectOrderRequest(
        buyer_id=request.buyer_id,
        listing_id=request.listing_id,
        quantity=1.0,
        language=request.language
    )
    return create_direct_order(direct_req, db)


# ─── 2. BUYER PROTOTYPE PAYMENT ───
@router.post("/order/pay")
def pay_order(request: PayOrderRequest, db: Session = Depends(get_db)):
    """
    Step 2 (Prototype Payment):
    Upon completing the simulated 10-second payment loader, transitions order status
    to 'payment_completed' (strictly English), updates inventory, and logs to order_history.
    """
    print(f"\n[DEBUG] === Processing Payment for Order #{request.order_id} ===")
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.buyer_id != request.buyer_id:
        raise HTTPException(status_code=403, detail="Unauthorized: Not the buyer for this order")
        
    order.status = "payment_completed" # Strictly English
    
    # Deduct listing inventory
    listing = db.query(Listing).filter(Listing.id == order.listing_id).first()
    if listing and listing.quantity:
        listing.quantity = max(0.0, listing.quantity - order.quantity)
        if listing.quantity == 0:
            listing.status = "SOLD"

    # Log to order_history strictly in English
    order_hist = OrderHistory(
        order_id=order.id,
        status="payment_completed",
        action="Payment Completed",
        notes=f"Payment of INR {order.total_amount} confirmed via 10-second UPI gateway"
    )
    db.add(order_hist)

    hist = History(
        entity_type="order",
        entity_id=order.id,
        action="Payment Completed",
        details=f"Payment of INR {order.total_amount} processed for Order #{order.id}"
    )
    db.add(hist)
    db.commit()
    db.refresh(order)
    
    logger.info(f"Order #{order.id}: Payment completed (₹{order.total_amount}). Status: payment_completed")
    
    buyer_voice_prompt = get_localized_prompt("payment_paid_buyer", request.language, amount=order.total_amount)
    seller_voice_prompt = get_localized_prompt("seller_amount_received", request.language, amount=order.total_amount, item_title=order.item_title)
    localized_status = get_localized_status(order.status, request.language)
    
    return {
        "status": "success",
        "order_id": order.id,
        "order_status": order.status, # Strictly English ('payment_completed')
        "status_localized": localized_status,
        "total_amount": order.total_amount,
        "buyer_voice_prompt": buyer_voice_prompt,
        "seller_voice_prompt": seller_voice_prompt
    }


# ─── 3. SELLER ACTION 1: ORDER PACKED ───
@router.post("/order/pack")
def pack_order(request: PackOrderRequest, db: Session = Depends(get_db)):
    """
    Seller Action 1 (Order Packed):
    Seller clicks or says 'Pack Order' to mark package as ready in SQLite ('order_packed').
    """
    print(f"\n[DEBUG] === Seller Packing Order #{request.order_id} ===")
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.seller_id != request.seller_id:
        raise HTTPException(status_code=403, detail="Unauthorized: Not the seller for this order")
        
    order.status = "order_packed" # Strictly English
    
    order_hist = OrderHistory(
        order_id=order.id,
        status="order_packed",
        action="Order Packed",
        notes="Seller packed the produce and labeled the parcel for logistics pickup"
    )
    db.add(order_hist)
    db.commit()
    db.refresh(order)
    
    localized_prompt = get_localized_prompt("seller_order_packed", request.language, order_id=order.id)
    localized_status = get_localized_status(order.status, request.language)
    
    return {
        "status": "success",
        "order_id": order.id,
        "order_status": order.status,
        "status_localized": localized_status,
        "voice_prompt": localized_prompt
    }


# ─── 4. SELLER ACTION 2: SCHEDULE PICKUP ───
@router.post("/order/schedule-pickup")
@router.post("/logistics/dispatch")
def schedule_order_pickup(request: SchedulePickupRequest, db: Session = Depends(get_db)):
    """
    Seller Action 2 (Schedule Pickup):
    Seller clicks or says 'Schedule Pickup' to assign logistics/delivery dispatch ('pickup_scheduled').
    """
    print(f"\n[DEBUG] === Scheduling Logistics Dispatch for Order #{request.order_id} ===")
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order.seller_id != request.seller_id:
        raise HTTPException(status_code=403, detail="Unauthorized: Not the seller for this order")
        
    seller = db.query(User).filter(User.user_id == order.seller_id).first()
    seller_loc = seller.village if (seller and seller.village) else "Rural Hub"
    
    delivery_partner = "TRIFED Rural Logistics • Van #TN-43-A-1284 (Driver: Murugan • 📞 98421 54321)"
    tracking_id = f"TR-LOG-{str(order.id).zfill(4)}-DISPATCH"
    pickup_time = "Today, 4:30 PM"
    pickup_address = f"{seller_loc}, Farmer Resource Center"
    
    order.status = "pickup_scheduled" # Strictly English
    order.delivery_partner = delivery_partner
    order.tracking_id = tracking_id
    order.pickup_time = pickup_time
    order.pickup_address = pickup_address
    
    order_hist = OrderHistory(
        order_id=order.id,
        status="pickup_scheduled",
        action="Pickup Scheduled",
        notes=f"Pickup assigned to {delivery_partner}. Window: {pickup_time}"
    )
    db.add(order_hist)
    db.commit()
    db.refresh(order)
    
    localized_prompt = get_localized_prompt(
        "pickup_scheduled_confirmation", 
        request.language, 
        delivery_partner="TRIFED Rural Logistics", 
        pickup_time=pickup_time
    )
    localized_status = get_localized_status(order.status, request.language)
    
    return {
        "status": "success",
        "order_id": order.id,
        "order_status": order.status,
        "status_localized": localized_status,
        "delivery_partner": order.delivery_partner,
        "tracking_id": order.tracking_id,
        "pickup_time": order.pickup_time,
        "pickup_address": order.pickup_address,
        "voice_prompt": localized_prompt
    }


# ─── 5. PACKAGE MOVING STATE ───
@router.post("/order/dispatch")
def dispatch_order(request: DispatchOrderRequest, db: Session = Depends(get_db)):
    """
    Logistics Handover / Package Moving state:
    Updates tracking state to 'package_moving' which is visible in real-time on both dashboards.
    """
    print(f"\n[DEBUG] === Setting Order #{request.order_id} to Package Moving ===")
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    order.status = "package_moving" # Strictly English
    
    order_hist = OrderHistory(
        order_id=order.id,
        status="package_moving",
        action="Package Moving",
        notes="Parcel handed over to logistics partner and currently moving towards buyer destination"
    )
    db.add(order_hist)
    db.commit()
    db.refresh(order)
    
    localized_prompt = get_localized_prompt("seller_order_dispatched", request.language, order_id=order.id)
    localized_status = get_localized_status(order.status, request.language)
    
    return {
        "status": "success",
        "order_id": order.id,
        "order_status": order.status,
        "status_localized": localized_status,
        "delivery_partner": order.delivery_partner,
        "tracking_id": order.tracking_id,
        "voice_prompt": localized_prompt
    }


# ─── 6. FINAL COMPLETION: ORDER RECEIVED ───
@router.post("/order/receive")
def confirm_order_received(request: ReceiveOrderRequest, db: Session = Depends(get_db)):
    """
    Order Received Confirmation:
    Once delivery completes, updates order status to 'order_received' on both buyer and seller screens,
    logging final purchase and seller earnings.
    """
    print(f"\n[DEBUG] === User {request.user_id} confirming Order #{request.order_id} Received ===")
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    order.status = "order_received" # Strictly English
    order.delivery_time = "Delivered & Received"
    
    order_hist = OrderHistory(
        order_id=order.id,
        status="order_received",
        action="Order Received",
        notes=f"Delivery completed and verified. Final earnings credited to seller: INR {order.total_amount}"
    )
    db.add(order_hist)
    db.commit()
    db.refresh(order)
    
    localized_prompt = get_localized_prompt("buyer_order_received", request.language, order_id=order.id)
    localized_status = get_localized_status(order.status, request.language)
    
    return {
        "status": "success",
        "order_id": order.id,
        "order_status": order.status,
        "status_localized": localized_status,
        "total_amount": order.total_amount,
        "delivery_time": order.delivery_time,
        "voice_prompt": localized_prompt
    }


# ─── 7. SELLER DASHBOARD: NEW BUYER ORDERS ───
@router.get("/orders/seller/pending/{seller_id}")
def get_seller_pending_orders(seller_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Displays 'New Buyer Orders' for the seller showing the exact product,
    exact quantity requested, total amount, buyer name, village, and phone.
    """
    orders = db.query(Order).filter(
        Order.seller_id == seller_id,
        Order.status.in_(["order_placed", "payment_completed", "order_confirmed", "interest_expressed", "invitation_accepted"])
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
        
    voice_notification = ""
    if len(results) > 0:
        latest = results[0]
        voice_notification = get_localized_prompt(
            "seller_new_buyer_order", 
            language, 
            quantity=latest["quantity"], 
            unit=latest["unit"], 
            item_title=latest["item_title"], 
            buyer_name=latest["buyer_name"], 
            amount=latest["total_amount"]
        )
        
    return {
        "count": len(results),
        "orders": results,
        "voice_notification": voice_notification
    }


# ─── 8. SELLER DASHBOARD: FULFILLMENT & LOGISTICS TRACKING ───
@router.get("/orders/seller/confirmed/{seller_id}")
def get_seller_confirmed_orders(seller_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Returns orders in active fulfillment (order_packed, pickup_scheduled, package_moving, order_received).
    """
    orders = db.query(Order).filter(
        Order.seller_id == seller_id,
        Order.status.in_(["order_packed", "pickup_scheduled", "package_moving", "order_received", "payment_paid", "order_confirmed", "processing"])
    ).order_by(Order.id.desc()).all()
    
    results = []
    for o in orders:
        buyer = db.query(User).filter(User.user_id == o.buyer_id).first()
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
            "delivery_partner": o.delivery_partner,
            "tracking_id": o.tracking_id,
            "pickup_time": o.pickup_time,
            "pickup_address": o.pickup_address,
            "delivery_time": o.delivery_time,
            "is_packed": o.status in ["order_packed", "pickup_scheduled", "package_moving", "order_received"],
            "is_pickup_scheduled": o.status in ["pickup_scheduled", "package_moving", "order_received"],
            "is_package_moving": o.status in ["package_moving", "order_received"],
            "is_order_received": o.status == "order_received",
            "updated_at": o.updated_at.isoformat() if o.updated_at else None
        })
        
    return {
        "count": len(results),
        "confirmed_orders": results
    }


# ─── 9. ORDER DETAILS WITH TRACKING LOGS ───
@router.get("/order/{order_id}")
def get_order_status(order_id: int, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Get full order status and tracking timeline in English and localized representations.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    seller = db.query(User).filter(User.user_id == order.seller_id).first()
    buyer = db.query(User).filter(User.user_id == order.buyer_id).first()
    
    # Retrieve audit history entries
    history_records = db.query(OrderHistory).filter(OrderHistory.order_id == order.id).order_by(OrderHistory.id.asc()).all()
    history_logs = [{
        "status": h.status,
        "action": h.action,
        "notes": h.notes,
        "created_at": h.created_at.isoformat() if h.created_at else None
    } for h in history_records]

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
        "delivery_partner": order.delivery_partner,
        "tracking_id": order.tracking_id,
        "pickup_time": order.pickup_time,
        "pickup_address": order.pickup_address,
        "delivery_time": order.delivery_time,
        "status": order.status, # Strictly English
        "status_localized": get_localized_status(order.status, language),
        "history_logs": history_logs,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None
    }


# ─── 10. BUYER ACTIVE ORDERS ───
@router.get("/orders/buyer/active/{buyer_id}")
def get_buyer_active_orders(buyer_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Returns active orders for the buyer with real-time status and tracking.
    """
    orders = db.query(Order).filter(
        Order.buyer_id == buyer_id,
        Order.status != "order_received"
    ).order_by(Order.id.desc()).all()
    
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
            "delivery_partner": o.delivery_partner,
            "tracking_id": o.tracking_id,
            "pickup_time": o.pickup_time,
            "pickup_address": o.pickup_address,
            "delivery_time": o.delivery_time,
            "status": o.status,
            "status_localized": get_localized_status(o.status, language),
            "created_at": o.created_at.isoformat() if o.created_at else None
        })
    return {"orders": results}


# ─── 11. DEDICATED ORDER HISTORY: BUYER ───
@router.get("/orders/buyer/history/{buyer_id}")
def get_buyer_order_history(buyer_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Dedicated Buyer Order History endpoint listing all completed and past orders.
    """
    orders = db.query(Order).filter(Order.buyer_id == buyer_id).order_by(Order.id.desc()).all()
    results = []
    total_spent = 0.0

    for o in orders:
        seller = db.query(User).filter(User.user_id == o.seller_id).first()
        if o.status in ["payment_completed", "order_packed", "pickup_scheduled", "package_moving", "order_received"]:
            total_spent += float(o.total_amount or 0.0)

        results.append({
            "order_id": o.id,
            "listing_id": o.listing_id,
            "seller_id": o.seller_id,
            "seller_name": seller.name if seller else "Producer",
            "seller_village": seller.village if seller else "",
            "seller_phone": seller.phone if seller else "",
            "item_title": o.item_title,
            "quantity": o.quantity,
            "unit": o.unit,
            "unit_price": o.unit_price,
            "total_amount": o.total_amount,
            "status": o.status, # Strictly English
            "status_localized": get_localized_status(o.status, language),
            "delivery_partner": o.delivery_partner,
            "tracking_id": o.tracking_id,
            "delivery_time": o.delivery_time,
            "is_delivered": o.status == "order_received",
            "created_at": o.created_at.isoformat() if o.created_at else None
        })

    return {
        "count": len(results),
        "total_spent": round(total_spent, 2),
        "orders": results
    }


# ─── 12. DEDICATED ORDER HISTORY: SELLER ───
@router.get("/orders/seller/history/{seller_id}")
def get_seller_order_history(seller_id: str, language: Optional[str] = "ta-IN", db: Session = Depends(get_db)):
    """
    Dedicated Seller Order History & Final Earnings endpoint.
    Computes total verified earnings from all completed/received orders.
    """
    orders = db.query(Order).filter(Order.seller_id == seller_id).order_by(Order.id.desc()).all()
    results = []
    total_earnings = 0.0

    for o in orders:
        buyer = db.query(User).filter(User.user_id == o.buyer_id).first()
        if o.status in ["payment_completed", "order_packed", "pickup_scheduled", "package_moving", "order_received"]:
            total_earnings += float(o.total_amount or 0.0)

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
            "unit_price": o.unit_price,
            "total_amount": o.total_amount,
            "status": o.status, # Strictly English
            "status_localized": get_localized_status(o.status, language),
            "delivery_partner": o.delivery_partner,
            "tracking_id": o.tracking_id,
            "delivery_time": o.delivery_time,
            "is_delivered": o.status == "order_received",
            "created_at": o.created_at.isoformat() if o.created_at else None
        })

    return {
        "count": len(results),
        "total_earnings": round(total_earnings, 2),
        "orders": results
    }


@router.get("/screen-instruction")
def get_screen_instruction(screen: str, language: Optional[str] = "ta-IN"):
    """
    Returns localized screen instructions for Single-Tap TTS interaction.
    """
    prompt_key = f"screen_{screen}"
    text = get_localized_prompt(prompt_key, language)
    return {"screen": screen, "language": language, "instruction": text}
