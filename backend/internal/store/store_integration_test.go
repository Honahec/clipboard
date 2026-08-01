package store

import (
	"context"
	"errors"
	"os"
	"testing"
)

func TestPrivateClipboardSharingAndCodeRefresh(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	repository, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer repository.Close()

	const oldCode = "TST234"
	const newCode = "TST235"
	_, _ = repository.pool.Exec(ctx, `DELETE FROM clipboards WHERE code = ANY($1)`, []string{oldCode, newCode})
	t.Cleanup(func() {
		_, _ = repository.pool.Exec(ctx, `DELETE FROM clipboards WHERE code = ANY($1)`, []string{oldCode, newCode})
	})

	owner := "integration-owner"
	created, err := repository.Create(ctx, CreateClipboard{
		Code: oldCode, Content: "private content", OwnerID: &owner, IsPublic: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !created.OwnedByMe {
		t.Fatal("created clipboard should be owned by the creating subject")
	}

	shared, err := repository.Get(ctx, oldCode, "")
	if err != nil {
		t.Fatal(err)
	}
	if shared.Content != "private content" || shared.IsPublic || shared.OwnedByMe {
		t.Fatalf("unexpected shared clipboard: %#v", shared)
	}
	publicItems, err := repository.List(ctx, "", 50)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range publicItems {
		if item.Code == oldCode {
			t.Fatal("private clipboard must not appear in the anonymous list")
		}
	}

	if _, err := repository.RefreshCode(ctx, oldCode, newCode, "other-owner"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("wrong-owner refresh error = %v, want ErrNotFound", err)
	}
	refreshed, err := repository.RefreshCode(ctx, oldCode, newCode, owner)
	if err != nil {
		t.Fatal(err)
	}
	if refreshed.Code != newCode || refreshed.UpdatedAt.Before(created.UpdatedAt) {
		t.Fatalf("unexpected refreshed clipboard: %#v", refreshed)
	}
	if _, err := repository.Get(ctx, oldCode, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("old-code lookup error = %v, want ErrNotFound", err)
	}
	if _, err := repository.Get(ctx, newCode, ""); err != nil {
		t.Fatalf("new-code lookup failed: %v", err)
	}
}
