-- Up Migration

-- Accounts. The application lower-cases and trims e-mails before writing; the
-- CHECK constraints below make the database enforce that too, so a bug (or a
-- manual INSERT) can never create a second row for "A@x.com" and "a@x.com", and
-- can never store a plaintext password in password_hash.
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  name          text        NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique          UNIQUE (email),
  CONSTRAINT users_email_normalized      CHECK (email = lower(btrim(email))),
  CONSTRAINT users_email_length          CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT users_name_length           CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT users_password_hash_format  CHECK (password_hash LIKE '$argon2id$%')
);

-- Down Migration

DROP TABLE users;
