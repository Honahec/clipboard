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
	created       *store.CreateClipboard
	getItem       store.Clipboard
	getError      error
	refreshInput  [3]string
	refreshError  error
	updateItem    store.Clipboard
	updateError   error
	updateCode    string
	updateSubject string
	updateInput   *store.UpdateClipboard
	updateCalls   int
}

func (f *fakeStore) List(context.Context, string, int) ([]store.Clipboard, error) {
	return []store.Clipboard{}, nil
}
func (f *fakeStore) Create(_ context.Context, input store.CreateClipboard) (store.Clipboard, error) {
	f.created = &input
	return store.Clipboard{Code: input.Code, Content: input.Content, IsPublic: input.IsPublic, BurnAfterRead: input.BurnAfterRead, ExpiresAt: input.ExpiresAt}, nil
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
func (f *fakeStore) Update(_ context.Context, code, subject string, input store.UpdateClipboard) (store.Clipboard, error) {
	f.updateCode = code
	f.updateSubject = subject
	f.updateInput = &input
	f.updateCalls++
	if f.updateError != nil {
		return store.Clipboard{}, f.updateError
	}
	if f.updateItem.Code == "" {
		return store.Clipboard{}, store.ErrNotFound
	}
	if input.Content != nil {
		f.updateItem.Content = *input.Content
	}
	if input.IsPublic != nil {
		f.updateItem.IsPublic = *input.IsPublic
	}
	return f.updateItem, nil
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
	payload, _ := json.Marshal(createRequest{Content: " hello ", IsPublic: true, BurnAfterRead: true, ExpiresAt: pointerTime(time.Now().Add(time.Hour))})
	request := httptest.NewRequest(http.MethodPost, "/api/clipboards", strings.NewReader(string(payload)))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	newTestServer(repository).ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}
	if repository.created == nil || repository.created.Content != "hello" || !repository.created.IsPublic || !repository.created.BurnAfterRead {
		t.Fatalf("unexpected create input: %#v", repository.created)
	}
	var item store.Clipboard
	if err := json.Unmarshal(response.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if !item.BurnAfterRead || item.Consumed || strings.Contains(response.Body.String(), `"consumed"`) {
		t.Fatalf("unexpected burn create response: %#v body=%s", item, response.Body.String())
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
	if item.Content != "private content" || item.IsPublic || item.Consumed || strings.Contains(response.Body.String(), `"consumed"`) {
		t.Fatalf("unexpected clipboard: %#v body=%s", item, response.Body.String())
	}
}

func TestBurnClipboardGetReturnsConsumed(t *testing.T) {
	repository := &fakeStore{getItem: store.Clipboard{
		Code: "ABC234", Content: "burn content", BurnAfterRead: true, Consumed: true,
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
	if !item.BurnAfterRead || !item.Consumed || !strings.Contains(response.Body.String(), `"consumed":true`) {
		t.Fatalf("unexpected consumed clipboard: %#v body=%s", item, response.Body.String())
	}
}

func TestConsumedClipboardReturnsNotFound(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/clipboards/ABC234", nil)
	response := httptest.NewRecorder()

	newTestServer(&fakeStore{getError: store.ErrNotFound}).ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusNotFound, response.Body.String())
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

func TestUpdateClipboardRequiresSignIn(t *testing.T) {
	request := httptest.NewRequest(http.MethodPatch, "/api/clipboards/ABC234", strings.NewReader(`{"content":"updated"}`))
	response := httptest.NewRecorder()

	newTestServer(&fakeStore{}).ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusUnauthorized, response.Body.String())
	}
}

func TestUpdateClipboardRejectsInvalidContent(t *testing.T) {
	overlong, err := json.Marshal(map[string]string{"content": strings.Repeat("界", maxContentLength+1)})
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		body string
	}{
		{name: "empty object", body: `{}`},
		{name: "empty content", body: `{"content":""}`},
		{name: "blank content", body: `{"content":" \n\t "}`},
		{name: "overlong content", body: string(overlong)},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			repository := &fakeStore{}
			request := httptest.NewRequest(http.MethodPatch, "/api/clipboards/ABC234", strings.NewReader(test.body))
			response := httptest.NewRecorder()

			newAuthenticatedTestServer(repository, auth.User{Subject: "user-1"}).ServeHTTP(response, request)

			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusBadRequest, response.Body.String())
			}
			if repository.updateCalls != 0 || repository.updateInput != nil {
				t.Fatalf("invalid update reached repository: calls=%d input=%#v", repository.updateCalls, repository.updateInput)
			}
		})
	}
}

func TestNonOwnerCannotUpdateClipboardContent(t *testing.T) {
	repository := &fakeStore{updateError: store.ErrNotFound}
	request := httptest.NewRequest(http.MethodPatch, "/api/clipboards/ABC234", strings.NewReader(`{"content":"updated"}`))
	response := httptest.NewRecorder()

	newAuthenticatedTestServer(repository, auth.User{Subject: "other-user"}).ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusNotFound, response.Body.String())
	}
	if repository.updateCalls != 1 || repository.updateCode != "ABC234" || repository.updateSubject != "other-user" || repository.updateInput == nil || repository.updateInput.Content == nil || *repository.updateInput.Content != "updated" || repository.updateInput.IsPublic != nil {
		t.Fatalf("unexpected update call: calls=%d code=%q subject=%q input=%#v", repository.updateCalls, repository.updateCode, repository.updateSubject, repository.updateInput)
	}
}

func TestOwnerCanUpdateClipboardContent(t *testing.T) {
	createdAt := time.Date(2026, time.August, 24, 10, 0, 0, 0, time.UTC)
	previousUpdatedAt := createdAt.Add(time.Minute)
	updatedAt := previousUpdatedAt.Add(time.Minute)
	expiresAt := createdAt.Add(time.Hour)
	repository := &fakeStore{updateItem: store.Clipboard{
		Code: "ABC234", Content: "old content", IsPublic: false, ExpiresAt: &expiresAt,
		CreatedAt: createdAt, UpdatedAt: updatedAt, OwnedByMe: true,
	}}
	const content = "  updated\ncontent  "
	payload, err := json.Marshal(map[string]string{"content": content})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPatch, "/api/clipboards/abc234", strings.NewReader(string(payload)))
	response := httptest.NewRecorder()

	newAuthenticatedTestServer(repository, auth.User{Subject: "user-1"}).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if repository.updateCalls != 1 || repository.updateCode != "ABC234" || repository.updateSubject != "user-1" || repository.updateInput == nil || repository.updateInput.Content == nil || *repository.updateInput.Content != content || repository.updateInput.IsPublic != nil {
		t.Fatalf("unexpected update call: calls=%d code=%q subject=%q input=%#v", repository.updateCalls, repository.updateCode, repository.updateSubject, repository.updateInput)
	}
	var item store.Clipboard
	if err := json.Unmarshal(response.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.Code != "ABC234" || item.Content != content || item.IsPublic || item.ExpiresAt == nil || !item.ExpiresAt.Equal(expiresAt) || !item.CreatedAt.Equal(createdAt) || !item.UpdatedAt.Equal(updatedAt) || !item.UpdatedAt.After(previousUpdatedAt) || !item.OwnedByMe {
		t.Fatalf("unexpected clipboard: %#v", item)
	}
}

func TestOwnerCanUpdateClipboardVisibilityOnly(t *testing.T) {
	repository := &fakeStore{updateItem: store.Clipboard{Code: "ABC234", Content: "keep me", IsPublic: true, OwnedByMe: true}}
	request := httptest.NewRequest(http.MethodPatch, "/api/clipboards/ABC234", strings.NewReader(`{"is_public":false}`))
	response := httptest.NewRecorder()

	newAuthenticatedTestServer(repository, auth.User{Subject: "user-1"}).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if repository.updateCalls != 1 || repository.updateCode != "ABC234" || repository.updateSubject != "user-1" || repository.updateInput == nil || repository.updateInput.Content != nil || repository.updateInput.IsPublic == nil || *repository.updateInput.IsPublic {
		t.Fatalf("unexpected update call: calls=%d code=%q subject=%q input=%#v", repository.updateCalls, repository.updateCode, repository.updateSubject, repository.updateInput)
	}
	var item store.Clipboard
	if err := json.Unmarshal(response.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.Content != "keep me" || item.IsPublic {
		t.Fatalf("unexpected clipboard: %#v", item)
	}
}

func TestOwnerCanUpdateContentAndVisibility(t *testing.T) {
	repository := &fakeStore{updateItem: store.Clipboard{Code: "ABC234", Content: "old", IsPublic: false, OwnedByMe: true}}
	request := httptest.NewRequest(http.MethodPatch, "/api/clipboards/ABC234", strings.NewReader(`{"content":"new","is_public":true}`))
	response := httptest.NewRecorder()

	newAuthenticatedTestServer(repository, auth.User{Subject: "user-1"}).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if repository.updateCalls != 1 || repository.updateCode != "ABC234" || repository.updateSubject != "user-1" || repository.updateInput == nil || repository.updateInput.Content == nil || *repository.updateInput.Content != "new" || repository.updateInput.IsPublic == nil || !*repository.updateInput.IsPublic {
		t.Fatalf("unexpected atomic update call: calls=%d code=%q subject=%q input=%#v", repository.updateCalls, repository.updateCode, repository.updateSubject, repository.updateInput)
	}
	var item store.Clipboard
	if err := json.Unmarshal(response.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.Content != "new" || !item.IsPublic || !item.OwnedByMe {
		t.Fatalf("unexpected clipboard: %#v", item)
	}
}

func pointerTime(value time.Time) *time.Time { return &value }
