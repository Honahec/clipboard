package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gorilla/securecookie"
	"golang.org/x/oauth2"
)

const sessionCookie = "clipboard_session"
const flowCookie = "clipboard_oidc_flow"

type User struct {
	Subject string `json:"subject"`
	Name    string `json:"name,omitempty"`
	Email   string `json:"email,omitempty"`
	Picture string `json:"picture,omitempty"`
}

type sessionData struct {
	User      User  `json:"user"`
	ExpiresAt int64 `json:"expires_at"`
}

type flowData struct {
	State    string `json:"state"`
	Nonce    string `json:"nonce"`
	Verifier string `json:"verifier"`
}

type Manager struct {
	enabled  bool
	secure   bool
	codec    *securecookie.SecureCookie
	oauth    oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func Disabled() *Manager { return &Manager{} }

func New(ctx context.Context, issuer, clientID, clientSecret, publicURL, secret string) (*Manager, error) {
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, err
	}
	parsed, err := url.Parse(publicURL)
	if err != nil {
		return nil, err
	}
	digest := sha512.Sum512([]byte(secret))
	codec := securecookie.New(digest[:32], digest[32:])
	codec.MaxAge(int((24 * time.Hour).Seconds()))

	return &Manager{
		enabled: true,
		secure:  parsed.Scheme == "https",
		codec:   codec,
		oauth: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  publicURL + "/api/auth/callback",
			Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
		},
		verifier: provider.Verifier(&oidc.Config{ClientID: clientID}),
	}, nil
}

func (m *Manager) Enabled() bool { return m != nil && m.enabled }

func (m *Manager) StartLogin(w http.ResponseWriter, r *http.Request) error {
	if !m.Enabled() {
		return errors.New("OIDC login is not configured")
	}
	state, err := randomToken(32)
	if err != nil {
		return err
	}
	nonce, err := randomToken(32)
	if err != nil {
		return err
	}
	verifier, err := randomToken(48)
	if err != nil {
		return err
	}
	encoded, err := m.codec.Encode(flowCookie, flowData{State: state, Nonce: nonce, Verifier: verifier})
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: flowCookie, Value: encoded, Path: "/api/auth/callback", HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	challenge := sha256.Sum256([]byte(verifier))
	loginURL := m.oauth.AuthCodeURL(state,
		oauth2.SetAuthURLParam("nonce", nonce),
		oauth2.SetAuthURLParam("code_challenge", base64.RawURLEncoding.EncodeToString(challenge[:])),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
	http.Redirect(w, r, loginURL, http.StatusFound)
	return nil
}

func (m *Manager) FinishLogin(ctx context.Context, w http.ResponseWriter, r *http.Request) (User, error) {
	flowValue, err := r.Cookie(flowCookie)
	if err != nil {
		return User{}, errors.New("login flow cookie is missing")
	}
	var flow flowData
	if err := m.codec.Decode(flowCookie, flowValue.Value, &flow); err != nil {
		return User{}, errors.New("login flow cookie is invalid")
	}
	if r.URL.Query().Get("state") == "" || r.URL.Query().Get("state") != flow.State {
		return User{}, errors.New("OIDC state mismatch")
	}
	if providerError := r.URL.Query().Get("error"); providerError != "" {
		return User{}, errors.New("OIDC provider returned " + providerError)
	}
	token, err := m.oauth.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(flow.Verifier))
	if err != nil {
		return User{}, err
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return User{}, errors.New("OIDC token response is missing id_token")
	}
	idToken, err := m.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return User{}, err
	}
	if idToken.Nonce != flow.Nonce {
		return User{}, errors.New("OIDC nonce mismatch")
	}
	var claims struct {
		Subject           string `json:"sub"`
		Name              string `json:"name"`
		PreferredUsername string `json:"preferred_username"`
		Email             string `json:"email"`
		Picture           string `json:"picture"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return User{}, err
	}
	name := claims.Name
	if name == "" {
		name = claims.PreferredUsername
	}
	user := User{Subject: claims.Subject, Name: name, Email: claims.Email, Picture: claims.Picture}
	expiresAt := time.Now().Add(24 * time.Hour)
	if idToken.Expiry.Before(expiresAt) {
		expiresAt = idToken.Expiry
	}
	encoded, err := m.codec.Encode(sessionCookie, sessionData{User: user, ExpiresAt: expiresAt.Unix()})
	if err != nil {
		return User{}, err
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: encoded, Path: "/", HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode, MaxAge: int(time.Until(expiresAt).Seconds())})
	http.SetCookie(w, &http.Cookie{Name: flowCookie, Value: "", Path: "/api/auth/callback", HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	return user, nil
}

func (m *Manager) User(r *http.Request) *User {
	if !m.Enabled() {
		return nil
	}
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return nil
	}
	var session sessionData
	if err := m.codec.Decode(sessionCookie, cookie.Value, &session); err != nil || session.ExpiresAt <= time.Now().Unix() || session.User.Subject == "" {
		return nil
	}
	return &session.User
}

func (m *Manager) Logout(w http.ResponseWriter) {
	secure := m != nil && m.secure
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}

func randomToken(length int) (string, error) {
	value := make([]byte, length)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}
