from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.core.database import Base

class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(String, ForeignKey("users.user_id"))
    
    title = Column(String, index=True)
    quantity = Column(Float)
    unit = Column(String)
    price_per_unit = Column(Float)
    total_price = Column(Float)
    
    description = Column(String)
    search_tags = Column(String)
    
    status = Column(String, default="ACTIVE") # ACTIVE, SOLD
