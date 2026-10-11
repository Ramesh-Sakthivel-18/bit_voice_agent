from sqlalchemy import Column, Integer, String, ForeignKey
from app.core.database import Base

class Interest(Base):
    __tablename__ = "interests"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"))
    buyer_id = Column(String, ForeignKey("users.user_id"))
