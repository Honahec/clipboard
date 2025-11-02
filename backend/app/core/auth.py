from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from .config import get_settings

settings = get_settings()


class AuthenticatedUser(BaseModel):
    """Represents the authenticated user extracted from the OAuth2 userinfo response."""

    user_id: str
    email: Optional[str] = None
    username: Optional[str] = None
    claims: Dict[str, Any]


class OAuth2UserInfoVerifier:
    """Fetches user info from the OAuth2 provider to validate bearer tokens."""

    async def verify(self, token: str) -> AuthenticatedUser:
        if not settings.OAUTH2_USERINFO_URL:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OAUTH2_USERINFO_URL is not configured.",
            )

        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                response = await client.get(
                    settings.OAUTH2_USERINFO_URL,
                    headers={"Authorization": f"Bearer {token}"},
                )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach OAuth2 service.",
            ) from exc

        if response.status_code == status.HTTP_401_UNAUTHORIZED:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials.",
            )

        if not response.is_success:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to fetch OAuth2 user info: {response.status_code}",
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="OAuth2 user info response is not valid JSON.",
            ) from exc

        user_id = payload.get("sub") or payload.get("id") or payload.get("user_id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User info response missing identifier.",
            )

        if settings.OAUTH2_AUDIENCE:
            audience = payload.get("aud")
            if audience and audience != settings.OAUTH2_AUDIENCE:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token audience does not match the configured audience.",
                )

        if settings.OAUTH2_ISSUER:
            issuer = payload.get("iss")
            if issuer and issuer != settings.OAUTH2_ISSUER:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token issuer does not match the configured issuer.",
                )

        return AuthenticatedUser(
            user_id=str(user_id),
            email=payload.get("email"),
            username=payload.get("username") or payload.get("preferred_username"),
            claims=payload,
        )


_bearer_scheme = HTTPBearer(auto_error=False)
_verifier = OAuth2UserInfoVerifier()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> AuthenticatedUser:
    """Require a valid OAuth2 bearer token."""
    if not settings.OAUTH2_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth2 authentication is not enabled on this server.",
        )

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    return await _verifier.verify(credentials.credentials)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> Optional[AuthenticatedUser]:
    """Return the authenticated user if present; otherwise None."""
    if not settings.OAUTH2_ENABLED:
        return None

    if not credentials:
        return None

    return await _verifier.verify(credentials.credentials)
