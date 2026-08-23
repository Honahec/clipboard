package store

import (
	"context"
	_ "embed"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("clipboard not found")

type Clipboard struct {
	Code          string     `json:"code"`
	Content       string     `json:"content"`
	IsPublic      bool       `json:"is_public"`
	BurnAfterRead bool       `json:"burn_after_read"`
	Consumed      bool       `json:"consumed,omitempty"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	OwnedByMe     bool       `json:"owned_by_me"`
	OwnerID       *string    `json:"-"`
}

type CreateClipboard struct {
	Code          string
	Content       string
	OwnerID       *string
	IsPublic      bool
	BurnAfterRead bool
	ExpiresAt     *time.Time
}

type UpdateClipboard struct {
	Content  *string
	IsPublic *bool
}

type Repository interface {
	List(context.Context, string, int) ([]Clipboard, error)
	Create(context.Context, CreateClipboard) (Clipboard, error)
	Get(context.Context, string, string) (Clipboard, error)
	RefreshCode(context.Context, string, string, string) (Clipboard, error)
	Update(context.Context, string, string, UpdateClipboard) (Clipboard, error)
	Delete(context.Context, string, string) error
	Ping(context.Context) error
}

type Postgres struct {
	pool *pgxpool.Pool
}

//go:embed migration.sql
var migration string

func Open(ctx context.Context, databaseURL string) (*Postgres, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	config.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	if _, err := pool.Exec(ctx, migration); err != nil {
		pool.Close()
		return nil, err
	}
	return &Postgres{pool: pool}, nil
}

func (p *Postgres) Close() { p.pool.Close() }

func (p *Postgres) Ping(ctx context.Context) error { return p.pool.Ping(ctx) }

const selectColumns = `code, content, owner_subject, is_public, burn_after_read, expires_at, created_at, updated_at`

func scanClipboard(row pgx.Row, subject string) (Clipboard, error) {
	var item Clipboard
	if err := row.Scan(&item.Code, &item.Content, &item.OwnerID, &item.IsPublic, &item.BurnAfterRead, &item.ExpiresAt, &item.CreatedAt, &item.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Clipboard{}, ErrNotFound
		}
		return Clipboard{}, err
	}
	item.OwnedByMe = item.OwnerID != nil && subject != "" && *item.OwnerID == subject
	return item, nil
}

func scanConsumedClipboard(row pgx.Row, subject string) (Clipboard, error) {
	var item Clipboard
	if err := row.Scan(&item.Code, &item.Content, &item.OwnerID, &item.IsPublic, &item.BurnAfterRead, &item.ExpiresAt, &item.CreatedAt, &item.UpdatedAt, &item.Consumed); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Clipboard{}, ErrNotFound
		}
		return Clipboard{}, err
	}
	item.OwnedByMe = item.OwnerID != nil && subject != "" && *item.OwnerID == subject
	return item, nil
}

func (p *Postgres) List(ctx context.Context, subject string, limit int) ([]Clipboard, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT `+selectColumns+`
		FROM clipboards
		WHERE (expires_at IS NULL OR expires_at > now())
		  AND burn_after_read = false
		  AND (is_public = true OR ($1 <> '' AND owner_subject = $1))
		ORDER BY created_at DESC
		LIMIT $2`, subject, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Clipboard, 0)
	for rows.Next() {
		item, err := scanClipboard(rows, subject)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (p *Postgres) Create(ctx context.Context, input CreateClipboard) (Clipboard, error) {
	return scanClipboard(p.pool.QueryRow(ctx, `
		INSERT INTO clipboards (code, content, owner_subject, is_public, burn_after_read, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING `+selectColumns,
		input.Code, input.Content, input.OwnerID, input.IsPublic, input.BurnAfterRead, input.ExpiresAt), valueOrEmpty(input.OwnerID))
}

func (p *Postgres) Get(ctx context.Context, code, subject string) (Clipboard, error) {
	return scanConsumedClipboard(p.pool.QueryRow(ctx, `
		WITH consumed AS (
			DELETE FROM clipboards
			WHERE code = $1
			  AND burn_after_read = true
			  AND (expires_at IS NULL OR expires_at > now())
			RETURNING `+selectColumns+`
		)
		SELECT `+selectColumns+`, true AS consumed FROM consumed
		UNION ALL
		SELECT `+selectColumns+`, false AS consumed
		FROM clipboards
		WHERE code = $1
		  AND burn_after_read = false
		  AND (expires_at IS NULL OR expires_at > now())
		LIMIT 1`, code), subject)
}

func (p *Postgres) RefreshCode(ctx context.Context, code, newCode, subject string) (Clipboard, error) {
	return scanClipboard(p.pool.QueryRow(ctx, `
		UPDATE clipboards
		SET code = $2, updated_at = now()
		WHERE code = $1
		  AND owner_subject = $3
		  AND is_public = false
		  AND (expires_at IS NULL OR expires_at > now())
		RETURNING `+selectColumns, code, newCode, subject), subject)
}

func (p *Postgres) Update(ctx context.Context, code, subject string, input UpdateClipboard) (Clipboard, error) {
	return scanClipboard(p.pool.QueryRow(ctx, `
		UPDATE clipboards
		SET content = COALESCE($3, content),
		    is_public = COALESCE($4, is_public),
		    updated_at = now()
		WHERE code = $1 AND owner_subject = $2 AND (expires_at IS NULL OR expires_at > now())
		RETURNING `+selectColumns, code, subject, input.Content, input.IsPublic), subject)
}

func (p *Postgres) Delete(ctx context.Context, code, subject string) error {
	tag, err := p.pool.Exec(ctx, `DELETE FROM clipboards WHERE code = $1 AND owner_subject = $2`, code, subject)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
