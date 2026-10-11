from sqlalchemy import Column, Integer, String, LargeBinary
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    name = Column(String, index=True)
    village = Column(String)
    phone = Column(String)
    language = Column(String)
    role = Column(String)
    
    # Store the 512-d float32 vector as binary blob
    face_embedding = Column(LargeBinary, nullable=False)
