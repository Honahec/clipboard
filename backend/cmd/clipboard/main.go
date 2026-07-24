package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Honahec/clipboard/backend/internal/auth"
	"github.com/Honahec/clipboard/backend/internal/config"
	"github.com/Honahec/clipboard/backend/internal/httpapi"
	"github.com/Honahec/clipboard/backend/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	repository, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database initialization failed", "error", err)
		os.Exit(1)
	}
	defer repository.Close()

	authManager := auth.Disabled()
	if cfg.OIDCIssuer != "" {
		authManager, err = auth.New(ctx, cfg.OIDCIssuer, cfg.OIDCClientID, cfg.OIDCClientSecret, cfg.PublicURL, cfg.AuthSessionSecret)
		if err != nil {
			logger.Error("OIDC initialization failed", "error", err)
			os.Exit(1)
		}
	}

	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           httpapi.New(repository, authManager, cfg.PublicURL, cfg.WebDir, logger),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	go func() {
		logger.Info("clipboard server started", "address", cfg.ListenAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server failed", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
	}
}
