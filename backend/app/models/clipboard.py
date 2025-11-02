from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional
import random
import string
from ..core.database import Base


def generate_clipboard_id() -> str:
    """Generate a unique 6-character clipboard ID"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class Clipboard(Base):
    __tablename__ = "clipboards"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    clipboard_id = Column(String(6), unique=True, index=True, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_encrypted = Column(Boolean, default=False)
    encryption_key = Column(String(255), nullable=True)
    user = Column(String(255), nullable=True)


# Pydantic Schemas
class ClipboardBase(BaseModel):
    content: str = Field(..., min_length=1, description="content of the clipboard")
    expires_at: Optional[datetime] = Field(None, description="expiration time")
    is_encrypted: bool = Field(False, description="whether it is encrypted")
    encryption_key: Optional[str] = Field(None, description="encryption key")
    user: Optional[str] = Field(None, description="associated user")


class ClipboardCreate(ClipboardBase):
    pass


class ClipboardUpdate(ClipboardBase):
    pass


class ClipboardResponse(ClipboardBase):
    id: int
    clipboard_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
