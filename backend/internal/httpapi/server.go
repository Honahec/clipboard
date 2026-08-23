package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"math/big"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Honahec/clipboard/backend/internal/auth"
	"github.com/Honahec/clipboard/backend/internal/store"
	"github.com/jackc/pgx/v5/pgconn"
)

const maxContentLength = 100_000
const anonymousMaxLifetime = 7 * 24 * time.Hour

type Server struct {
	store     store.Repository
	auth      authProvider
	publicURL string
	webDir    string
	logger    *slog.Logger
	handler   http.Handler
}

type authProvider interface {
	Enabled() bool
	StartLogin(http.ResponseWriter, *http.Request) error
	FinishLogin(context.Context, http.ResponseWriter, *http.Request) (auth.User, error)
	User(*http.Request) *auth.User
	Logout(http.ResponseWriter)
}

func New(repository store.Repository, authManager authProvider, publicURL, webDir string, logger *slog.Logger) *Server {
	server := &Server{store: repository, auth: authManager, publicURL: strings.TrimRight(publicURL, "/"), webDir: webDir, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", server.health)
	mux.HandleFunc("GET /api/auth/session", server.session)
	mux.HandleFunc("GET /api/auth/login", server.login)
	mux.HandleFunc("GET /api/auth/callback", server.callback)
	mux.HandleFunc("POST /api/auth/logout", server.logout)
	mux.HandleFunc("GET /api/clipboards", server.listClipboards)
	mux.HandleFunc("POST /api/clipboards", server.createClipboard)
	mux.HandleFunc("GET /api/clipboards/{code}", server.getClipboard)
	mux.HandleFunc("POST /api/clipboards/{code}/refresh-code", server.refreshClipboardCode)
	mux.HandleFunc("PATCH /api/clipboards/{code}", server.updateClipboard)
	mux.HandleFunc("DELETE /api/clipboards/{code}", server.deleteClipboard)
	mux.HandleFunc("GET /", server.static)
	server.handler = server.securityHeaders(server.requestLog(mux))
	return server
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.handler.ServeHTTP(w, r) }

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database is unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	user := s.auth.User(r)
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": user != nil, "oidc_enabled": s.auth.Enabled(), "user": user})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.StartLogin(w, r); err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
	}
}

func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	if _, err := s.auth.FinishLogin(r.Context(), w, r); err != nil {
		s.logger.Warn("OIDC callback failed", "error", err)
		http.Redirect(w, r, s.publicURL+"/?auth_error=1", http.StatusFound)
		return
	}
	http.Redirect(w, r, s.publicURL+"/", http.StatusFound)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "cross-origin request rejected")
		return
	}
	s.auth.Logout(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listClipboards(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			writeError(w, http.StatusBadRequest, "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}
	items, err := s.store.List(r.Context(), subject(s.auth.User(r)), limit)
	if err != nil {
		s.internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) getClipboard(w http.ResponseWriter, r *http.Request) {
	item, err := s.store.Get(r.Context(), normalizeCode(r.PathValue("code")), subject(s.auth.User(r)))
	if err != nil {
		s.storeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) refreshClipboardCode(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "cross-origin request rejected")
		return
	}
	user := s.auth.User(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "sign in to manage this clipboard")
		return
	}

	code := normalizeCode(r.PathValue("code"))
	for attempt := 0; attempt < 8; attempt++ {
		newCode, err := generateCode(6)
		if err != nil {
			s.internalError(w, err)
			return
		}
		if newCode == code {
			continue
		}
		item, err := s.store.RefreshCode(r.Context(), code, newCode, user.Subject)
		if err == nil {
			writeJSON(w, http.StatusOK, item)
			return
		}
		if isUniqueViolation(err) {
			continue
		}
		s.storeError(w, err)
		return
	}
	s.internalError(w, errors.New("could not allocate unique clipboard code"))
}

type createRequest struct {
	Content       string     `json:"content"`
	IsPublic      bool       `json:"is_public"`
	BurnAfterRead bool       `json:"burn_after_read"`
	ExpiresAt     *time.Time `json:"expires_at"`
}

func (s *Server) createClipboard(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "cross-origin request rejected")
		return
	}
	var input createRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.Content = strings.TrimSpace(input.Content)
	if input.Content == "" || len([]rune(input.Content)) > maxContentLength {
		writeError(w, http.StatusBadRequest, "content must contain between 1 and 100000 characters")
		return
	}
	now := time.Now()
	if input.ExpiresAt != nil && !input.ExpiresAt.After(now) {
		writeError(w, http.StatusBadRequest, "expiration must be in the future")
		return
	}
	user := s.auth.User(r)
	var ownerID *string
	if user == nil {
		if !input.IsPublic {
			writeError(w, http.StatusUnauthorized, "sign in to create a private clipboard")
			return
		}
		if input.ExpiresAt == nil || input.ExpiresAt.After(now.Add(anonymousMaxLifetime+time.Minute)) {
			writeError(w, http.StatusUnauthorized, "anonymous clipboards must expire within 7 days")
			return
		}
	} else {
		ownerID = &user.Subject
	}

	for attempt := 0; attempt < 8; attempt++ {
		code, err := generateCode(6)
		if err != nil {
			s.internalError(w, err)
			return
		}
		item, err := s.store.Create(r.Context(), store.CreateClipboard{Code: code, Content: input.Content, OwnerID: ownerID, IsPublic: input.IsPublic, BurnAfterRead: input.BurnAfterRead, ExpiresAt: input.ExpiresAt})
		if err == nil {
			writeJSON(w, http.StatusCreated, item)
			return
		}
		if !isUniqueViolation(err) {
			s.internalError(w, err)
			return
		}
	}
	s.internalError(w, errors.New("could not allocate unique clipboard code"))
}

type updateRequest struct {
	Content  *string `json:"content"`
	IsPublic *bool   `json:"is_public"`
}

func (s *Server) updateClipboard(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "cross-origin request rejected")
		return
	}
	user := s.auth.User(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "sign in to manage this clipboard")
		return
	}
	var input updateRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.Content == nil && input.IsPublic == nil {
		writeError(w, http.StatusBadRequest, "content or is_public is required")
		return
	}
	if input.Content != nil && (strings.TrimSpace(*input.Content) == "" || len([]rune(*input.Content)) > maxContentLength) {
		writeError(w, http.StatusBadRequest, "content must contain between 1 and 100000 characters")
		return
	}

	item, err := s.store.Update(r.Context(), normalizeCode(r.PathValue("code")), user.Subject, store.UpdateClipboard{
		Content:  input.Content,
		IsPublic: input.IsPublic,
	})
	if err != nil {
		s.storeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteClipboard(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "cross-origin request rejected")
		return
	}
	user := s.auth.User(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "sign in to manage this clipboard")
		return
	}
	if err := s.store.Delete(r.Context(), normalizeCode(r.PathValue("code")), user.Subject); err != nil {
		s.storeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}
	root := os.DirFS(s.webDir)
	path := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")
	if path == "." || path == "" {
		path = "index.html"
	}
	if info, err := fs.Stat(root, path); err != nil || info.IsDir() {
		path = "index.html"
	}
	contents, err := fs.ReadFile(root, path)
	if err != nil {
		writeError(w, http.StatusNotFound, "web application is not built")
		return
	}
	if contentType := mime.TypeByExtension(filepath.Ext(path)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	if path == "index.html" {
		w.Header().Set("Cache-Control", "no-cache")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	_, _ = w.Write(contents)
}

func (s *Server) storeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "clipboard not found")
	default:
		s.internalError(w, err)
	}
}

func isUniqueViolation(err error) bool {
	var postgresError *pgconn.PgError
	return errors.As(err, &postgresError) && postgresError.Code == "23505"
}

func (s *Server) internalError(w http.ResponseWriter, err error) {
	s.logger.Error("request failed", "error", err)
	writeError(w, http.StatusInternalServerError, "internal server error")
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://auth.honahec.cc")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (s *Server) requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		s.logger.Info("request", "method", r.Method, "path", r.URL.Path, "status", recorder.status, "duration", time.Since(started))
	})
}

func decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid JSON body: %w", err)
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func subject(user *auth.User) string {
	if user == nil {
		return ""
	}
	return user.Subject
}

func normalizeCode(code string) string { return strings.ToUpper(strings.TrimSpace(code)) }

func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := urlParse(origin)
	return err == nil && strings.EqualFold(parsed, r.Host)
}

func urlParse(raw string) (string, error) {
	request, err := http.NewRequest(http.MethodGet, raw, nil)
	if err != nil {
		return "", err
	}
	return request.URL.Host, nil
}

const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

func generateCode(length int) (string, error) {
	code := make([]byte, length)
	for index := range code {
		value, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeAlphabet))))
		if err != nil {
			return "", err
		}
		code[index] = codeAlphabet[value.Int64()]
	}
	return string(code), nil
}
