-- Up Migration

-- Server-side sessions for express-session (see src/modules/auth/pgSessionStore.js).
-- Only sha256(session id) is stored, never the id itself, so a leaked copy of
-- this table cannot be replayed as a cookie.
--   expires_at           effective expiry = LEAST(idle expiry, absolute expiry)
--   absolute_expires_at  hard cap set once at login; activity never extends it
--   user_id              also present inside data; kept as a column for the FK,
--                        the index and "revoke every session of a user"
-- Every user-owned table added in later versions follows the same pattern:
-- a user_id foreign key with ON DELETE CASCADE, so deleting an account removes
-- everything that belongs to it.
CREATE TABLE sessions (
  id_hash             bytea       PRIMARY KEY,
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  data                jsonb       NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  CONSTRAINT sessions_id_hash_length  CHECK (octet_length(id_hash) = 32),
  CONSTRAINT sessions_expiry_order    CHECK (expires_at <= absolute_expires_at)
);

CREATE INDEX sessions_user_id_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Down Migration

DROP TABLE sessions;
