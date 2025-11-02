from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..core.auth import (
    AuthenticatedUser,
    OAuth2UserInfoVerifier,
    get_current_user,
)
from ..core.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])

settings = get_settings()
_userinfo_verifier = OAuth2UserInfoVerifier()


class TokenExchangeRequest(BaseModel):
    code: str = Field(..., min_length=1)
    redirect_uri: Optional[str] = None
    code_verifier: Optional[str] = Field(None, min_length=1)


class TokenExchangeResponse(BaseModel):
    access_token: str
    token_type: Optional[str] = None
    expires_in: Optional[int] = None
    refresh_token: Optional[str] = None
    scope: Optional[str] = None
    user: AuthenticatedUser


@router.post("/token", response_model=TokenExchangeResponse)
async def exchange_authorization_code(payload: TokenExchangeRequest) -> TokenExchangeResponse:
    if not settings.OAUTH2_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth2 authentication is not enabled on this server.",
        )

    if not settings.OAUTH2_TOKEN_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAUTH2_TOKEN_URL is not configured.",
        )

    if not settings.OAUTH2_CLIENT_ID or not settings.OAUTH2_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth2 client credentials are not configured.",
        )

    redirect_uri = (
        payload.redirect_uri
        or settings.OAUTH2_REDIRECT_URI
    )
    if not redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth2 redirect URI is not configured.",
        )

    token_data = {
        "grant_type": "authorization_code",
        "code": payload.code,
        "redirect_uri": redirect_uri,
        "client_id": settings.OAUTH2_CLIENT_ID,
        "client_secret": settings.OAUTH2_CLIENT_SECRET,
    }

    if payload.code_verifier:
        token_data["code_verifier"] = payload.code_verifier

    if settings.OAUTH2_SCOPE:
        token_data["scope"] = settings.OAUTH2_SCOPE

    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
            response = await client.post(
                settings.OAUTH2_TOKEN_URL,
                data=token_data,
                headers=headers,
            )

            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Token endpoint redirected without a location header.",
                    )

                target_url = response.request.url.join(location)

                if response.status_code == 303:
                    response = await client.get(str(target_url))
                else:
                    response = await client.post(
                        str(target_url),
                        data=token_data,
                        headers=headers,
                    )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach OAuth2 service.",
        ) from exc

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization code is invalid or expired.",
        )

    if not response.is_success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Token endpoint returned unexpected status {response.status_code}.",
        )

    try:
        token_response = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Token endpoint response is not valid JSON.",
        ) from exc

    access_token = token_response.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Token endpoint response missing access_token.",
        )

    user = await _userinfo_verifier.verify(access_token)

    expires_in = token_response.get("expires_in")
    if isinstance(expires_in, str):
        if expires_in.isdigit():
            expires_in = int(expires_in)
        else:
            expires_in = None
    elif isinstance(expires_in, (float, int)):
        expires_in = int(expires_in)
    else:
        expires_in = None

    return TokenExchangeResponse(
        access_token=access_token,
        token_type=token_response.get("token_type"),
        expires_in=expires_in,
        refresh_token=token_response.get("refresh_token"),
        scope=token_response.get("scope"),
        user=user,
    )


@router.get("/user", response_model=AuthenticatedUser)
async def get_authenticated_user(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return current_user
