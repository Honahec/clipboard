package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Honahec/clipboard/backend/internal/auth"
	"github.com/Honahec/clipboard/backend/internal/store"
)

type fakeStore struct {
	created *store.CreateClipboard
}

func (f *fakeStore) List(context.Context, string, int) ([]store.Clipboard, error) {
	return []store.Clipboard{}, nil
}
func (f *fakeStore) Create(_ context.Context, input store.CreateClipboard) (store.Clipboard, error) {
	f.created = &input
	return store.Clipboard{Code: input.Code, Content: input.Content, IsPublic: input.IsPublic, ExpiresAt: input.ExpiresAt}, nil
}
func (f *fakeStore) Get(context.Context, string, string) (store.Clipboard, error) {
	return store.Clipboard{}, store.ErrNotFound
}
func (f *fakeStore) SetVisibility(context.Context, string, string, bool) (store.Clipboard, error) {
	return store.Clipboard{}, store.ErrNotFound
}
func (f *fakeStore) Delete(context.Context, string, string) error { return store.ErrNotFound }
func (f *fakeStore) Ping(context.Context) error                   { return nil }

func newTestServer(repository store.Repository) http.Handler {
	return New(repository, auth.Disabled(), "http://example.test", tTempDir(), slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func tTempDir() string { return "/directory-that-does-not-exist" }

func TestAnonymousClipboardRequiresExpiry(t *testing.T) {
	repository := &fakeStore{}
	request := httptest.NewRequest(http.MethodPost, "/api/clipboards", strings.NewReader(`{"content":"hello","is_public":true}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	newTestServer(repository).ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusUnauthorized, response.Body.String())
	}
}

func TestAnonymousClipboardCanExpireWithinSevenDays(t *testing.T) {
	repository := &fakeStore{}
	payload, _ := json.Marshal(createRequest{Content: " hello ", IsPublic: true, ExpiresAt: pointerTime(time.Now().Add(time.Hour))})
	request := httptest.NewRequest(http.MethodPost, "/api/clipboards", strings.NewReader(string(payload)))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	newTestServer(repository).ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}
	if repository.created == nil || repository.created.Content != "hello" || !repository.created.IsPublic {
		t.Fatalf("unexpected create input: %#v", repository.created)
	}
}

func TestMutationRejectsCrossOriginRequest(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "https://clipboard.example/api/clipboards", strings.NewReader(`{"content":"hello"}`))
	request.Host = "clipboard.example"
	request.Header.Set("Origin", "https://evil.example")
	response := httptest.NewRecorder()

	newTestServer(&fakeStore{}).ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusForbidden)
	}
}

func pointerTime(value time.Time) *time.Time { return &value }
