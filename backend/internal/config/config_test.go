package config

import "testing"

func TestLoadRequiresCompleteOIDCConfiguration(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("OIDC_ISSUER", "https://issuer.example")
	t.Setenv("OIDC_CLIENT_ID", "")
	t.Setenv("OIDC_CLIENT_SECRET", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected incomplete OIDC configuration to fail")
	}
}

func TestLoadAllowsAnonymousOnlyMode(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("OIDC_ISSUER", "")
	t.Setenv("OIDC_CLIENT_ID", "")
	t.Setenv("OIDC_CLIENT_SECRET", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.ListenAddr == "" || cfg.PublicURL == "" {
		t.Fatal("expected defaults to be populated")
	}
}
