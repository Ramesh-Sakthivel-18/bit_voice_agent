from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False)
    seller_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    buyer_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    
    # Strictly English statuses for full e-commerce lifecycle:
    # 'order_placed' -> 'payment_completed' / 'order_confirmed' -> 'order_packed' -> 'pickup_scheduled' -> 'package_moving' -> 'order_received'
    status = Column(String, index=True, default="order_placed")
    
    item_title = Column(String, nullable=False) # Strictly English
    quantity = Column(Float, default=1.0)
    unit = Column(String, default="units") # Strictly English
    unit_price = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    
    # Logistics & Transport Dispatch fields
    delivery_partner = Column(String, nullable=True)
    tracking_id = Column(String, nullable=True)
    pickup_time = Column(String, nullable=True)
    pickup_address = Column(String, nullable=True)
    delivery_time = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False)
    item_title = Column(String, nullable=False) # Strictly English
    quantity = Column(Float, default=1.0)
    unit = Column(String, default="units") # Strictly English
    unit_price = Column(Float, default=0.0)
    total_price = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class OrderHistory(Base):
    __tablename__ = "order_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    status = Column(String, nullable=False) # Strictly English (e.g. 'order_placed', 'order_packed', 'package_moving')
    action = Column(String, nullable=False) # Strictly English (e.g. 'Order Placed', 'Payment Completed', 'Order Packed', 'Pickup Scheduled', 'Package Moving', 'Order Received')
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class History(Base):
    __tablename__ = "history"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, default="order") # 'order', 'listing', 'user'
    entity_id = Column(Integer, nullable=False)
    action = Column(String, nullable=False) # Strictly English
    details = Column(String, nullable=True) # Strictly English
    created_at = Column(DateTime(timezone=True), server_default=func.now())
