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
	created      *store.CreateClipboard
	getItem      store.Clipboard
	getError     error
	refreshInput [3]string
	refreshError error
}

func (f *fakeStore) List(context.Context, string, int) ([]store.Clipboard, error) {
	return []store.Clipboard{}, nil
}
func (f *fakeStore) Create(_ context.Context, input store.CreateClipboard) (store.Clipboard, error) {
	f.created = &input
	return store.Clipboard{Code: input.Code, Content: input.Content, IsPublic: input.IsPublic, ExpiresAt: input.ExpiresAt}, nil
}
func (f *fakeStore) Get(context.Context, string, string) (store.Clipboard, error) {
	return f.getItem, f.getError
}
func (f *fakeStore) RefreshCode(_ context.Context, code, newCode, subject string) (store.Clipboard, error) {
	f.refreshInput = [3]string{code, newCode, subject}
	if f.refreshError != nil {
		return store.Clipboard{}, f.refreshError
	}
	return store.Clipboard{
		Code:      newCode,
		Content:   f.getItem.Content,
		IsPublic:  false,
		OwnedByMe: true,
	}, nil
}
func (f *fakeStore) SetVisibility(context.Context, string, string, bool) (store.Clipboard, error) {
	return store.Clipboard{}, store.ErrNotFound
}
func (f *fakeStore) Delete(context.Context, string, string) error { return store.ErrNotFound }
func (f *fakeStore) Ping(context.Context) error                   { return nil }

type fakeAuth struct {
	user *auth.User
}

func (f *fakeAuth) Enabled() bool                                       { return f.user != nil }
func (f *fakeAuth) StartLogin(http.ResponseWriter, *http.Request) error { return nil }
func (f *fakeAuth) FinishLogin(context.Context, http.ResponseWriter, *http.Request) (auth.User, error) {
	if f.user == nil {
		return auth.User{}, nil
	}
	return *f.user, nil
}
func (f *fakeAuth) User(*http.Request) *auth.User { return f.user }
func (f *fakeAuth) Logout(http.ResponseWriter)    {}

func newTestServer(repository store.Repository) http.Handler {
	return New(repository, auth.Disabled(), "http://example.test", tTempDir(), slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func newAuthenticatedTestServer(repository store.Repository, user auth.User) http.Handler {
	return New(repository, &fakeAuth{user: &user}, "http://example.test", tTempDir(), slog.New(slog.NewTextHandler(io.Discard, nil)))
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

func TestPrivateClipboardCanBeRetrievedByCode(t *testing.T) {
	repository := &fakeStore{getItem: store.Clipboard{
		Code: "ABC234", Content: "private content", IsPublic: false,
	}}
	request := httptest.NewRequest(http.MethodGet, "/api/clipboards/ABC234", nil)
	response := httptest.NewRecorder()

	newTestServer(repository).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	var item store.Clipboard
	if err := json.Unmarshal(response.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.Content != "private content" || item.IsPublic {
		t.Fatalf("unexpected clipboard: %#v", item)
	}
}

func TestRefreshClipboardCodeRequiresSignIn(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/clipboards/ABC234/refresh-code", nil)
	response := httptest.NewRecorder()

	newTestServer(&fakeStore{}).ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
}

func TestOwnerCanRefreshPrivateClipboardCode(t *testing.T) {
	repository := &fakeStore{getItem: store.Clipboard{Content: "private content"}}
	request := httptest.NewRequest(http.MethodPost, "/api/clipboards/ABC234/refresh-code", nil)
	response := httptest.NewRecorder()

	newAuthenticatedTestServer(repository, auth.User{Subject: "user-1"}).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if repository.refreshInput[0] != "ABC234" || repository.refreshInput[2] != "user-1" {
		t.Fatalf("unexpected refresh input: %#v", repository.refreshInput)
	}
	if len(repository.refreshInput[1]) != 6 || repository.refreshInput[1] == "ABC234" {
		t.Fatalf("new code = %q, want a different six-character code", repository.refreshInput[1])
	}
}

func pointerTime(value time.Time) *time.Time { return &value }
