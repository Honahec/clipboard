CREATE TABLE IF NOT EXISTS clipboards (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(8) NOT NULL UNIQUE,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 100000),
    owner_subject TEXT,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT private_clipboard_has_owner CHECK (is_public OR owner_subject IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS clipboards_created_at_idx ON clipboards (created_at DESC);
CREATE INDEX IF NOT EXISTS clipboards_owner_idx ON clipboards (owner_subject, created_at DESC) WHERE owner_subject IS NOT NULL;
CREATE INDEX IF NOT EXISTS clipboards_expiry_idx ON clipboards (expires_at) WHERE expires_at IS NOT NULL;
