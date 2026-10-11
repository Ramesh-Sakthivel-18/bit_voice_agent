from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False)
    seller_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    buyer_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    
    # Strictly English statuses as per Phase 1 specification:
    # 'interest_expressed' -> 'invitation_accepted' -> 'payment_paid' -> 'order_confirmed' -> 'processing'
    status = Column(String, index=True, default="interest_expressed")
    
    item_title = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    unit = Column(String, default="units")
    unit_price = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
