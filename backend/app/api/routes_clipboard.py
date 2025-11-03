from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.clipboard import (
    Clipboard,
    ClipboardCreate,
    ClipboardUpdate,
    ClipboardResponse,
    generate_clipboard_id
)
from ..core.auth import AuthenticatedUser, get_optional_user

router = APIRouter(prefix="/clipboard", tags=["clipboard"])


@router.post("/", response_model=ClipboardResponse, status_code=status.HTTP_201_CREATED)
async def create_clipboard(
    clipboard_data: ClipboardCreate,
    db: Session = Depends(get_db),
    current_user: Optional[AuthenticatedUser] = Depends(get_optional_user)
):
    """Create a new clipboard"""
    max_attempts = 10
    for _ in range(max_attempts):
        clipboard_id = generate_clipboard_id()
        try:
            owner_id = None
            if clipboard_data.user:
                if not current_user:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Authentication required to create a private clipboard.",
                    )
                permitted_ids = {current_user.user_id}
                if current_user.email:
                    permitted_ids.add(current_user.email)
                if clipboard_data.user not in permitted_ids:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot assign clipboard to a different user.",
                )
                owner_id = current_user.user_id

            if not clipboard_data.expires_at and not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required to create a permanent clipboard.",
                )

            db_clipboard = Clipboard(
                clipboard_id=clipboard_id,
                content=clipboard_data.content,
                expires_at=clipboard_data.expires_at,
                is_encrypted=clipboard_data.is_encrypted,
                encryption_key=clipboard_data.encryption_key,
                user=owner_id,
                is_public=clipboard_data.is_public
            )
            db.add(db_clipboard)
            db.commit()
            db.refresh(db_clipboard)
            return db_clipboard
        except IntegrityError:
            db.rollback()
            continue
    
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to generate unique clipboard ID."
    )


@router.get("/{clipboard_id}", response_model=ClipboardResponse)
async def read_clipboard(
    clipboard_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[AuthenticatedUser] = Depends(get_optional_user)
):
    db_clipboard = db.query(Clipboard).filter(
        Clipboard.clipboard_id == clipboard_id
    ).first()
    """Get clipboard by ID"""
    if not db_clipboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clipboard {clipboard_id} is not found."
        )
    
    # check expiration
    if db_clipboard.expires_at and db_clipboard.expires_at < datetime.now():
        db.delete(db_clipboard)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Clipboard has expired."
        )
    
    if db_clipboard.user:
        if not db_clipboard.is_public:
            if not current_user or db_clipboard.user != current_user.user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Clipboard is private.",
                )

    return db_clipboard


@router.get("/", response_model=List[ClipboardResponse])
async def list_clipboards(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: Optional[AuthenticatedUser] = Depends(get_optional_user)
):
    """Get list of all clipboards"""
    query = db.query(Clipboard)
    if current_user:
        query = query.filter(
            or_(Clipboard.is_public == True, Clipboard.user == current_user.user_id)
        )
    else:
        query = query.filter(Clipboard.is_public == True)

    clipboards = query.offset(skip).limit(limit).all()
    return clipboards


@router.put("/{clipboard_id}", response_model=ClipboardResponse)
async def update_clipboard(
    clipboard_id: str,
    clipboard_data: ClipboardUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[AuthenticatedUser] = Depends(get_optional_user)
):
    """Update clipboard"""
    db_clipboard = db.query(Clipboard).filter(
        Clipboard.clipboard_id == clipboard_id
    ).first()
    
    if not db_clipboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clipboard {clipboard_id} is not found."
        )
    
    if db_clipboard.user:
        if not current_user or db_clipboard.user != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to modify this clipboard.",
            )

    # update fields
    update_data = clipboard_data.model_dump(exclude_unset=True)

    if "user" in update_data:
        requested_user = update_data["user"]
        if requested_user:
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required to set clipboard visibility.",
                )
            permitted_ids = {current_user.user_id}
            if current_user.email:
                permitted_ids.add(current_user.email)
            if requested_user not in permitted_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot assign clipboard to a different user.",
                )
            update_data["user"] = current_user.user_id
        else:
            update_data["user"] = None

    # Handle is_public updates
    if "is_public" in update_data:
        # Only the owner can change visibility
        if not db_clipboard.user or (current_user and db_clipboard.user == current_user.user_id):
            pass  # Allow the update
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the owner can change visibility.",
            )

    for field, value in update_data.items():
        setattr(db_clipboard, field, value)
    
    db.commit()
    db.refresh(db_clipboard)
    return db_clipboard


@router.delete("/{clipboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clipboard(
    clipboard_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[AuthenticatedUser] = Depends(get_optional_user)
):
    """Delete clipboard"""
    db_clipboard = db.query(Clipboard).filter(
        Clipboard.clipboard_id == clipboard_id
    ).first()
    
    if not db_clipboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clipboard {clipboard_id} is not found."
        )

    if db_clipboard.user:
        if not current_user or db_clipboard.user != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this clipboard.",
            )
    
    db.delete(db_clipboard)
    db.commit()
    return None
