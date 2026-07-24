package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
)

type Config struct {
	ListenAddr        string
	DatabaseURL       string
	PublicURL         string
	WebDir            string
	OIDCIssuer        string
	OIDCClientID      string
	OIDCClientSecret  string
	AuthSessionSecret string
}

func Load() (Config, error) {
	cfg := Config{
		ListenAddr:        envOr("LISTEN_ADDR", "0.0.0.0:8080"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		PublicURL:         strings.TrimRight(envOr("PUBLIC_URL", "http://localhost:5173"), "/"),
		WebDir:            envOr("WEB_DIR", "../frontend/dist"),
		OIDCIssuer:        strings.TrimRight(os.Getenv("OIDC_ISSUER"), "/"),
		OIDCClientID:      os.Getenv("OIDC_CLIENT_ID"),
		OIDCClientSecret:  os.Getenv("OIDC_CLIENT_SECRET"),
		AuthSessionSecret: os.Getenv("AUTH_SESSION_SECRET"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	parsed, err := url.Parse(cfg.PublicURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return Config{}, fmt.Errorf("PUBLIC_URL must be an absolute URL")
	}
	if (cfg.OIDCIssuer == "") != (cfg.OIDCClientID == "" || cfg.OIDCClientSecret == "") {
		return Config{}, errors.New("OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET must be set together")
	}
	if cfg.OIDCIssuer != "" && len(cfg.AuthSessionSecret) < 32 {
		return Config{}, errors.New("AUTH_SESSION_SECRET must contain at least 32 characters when OIDC is enabled")
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
