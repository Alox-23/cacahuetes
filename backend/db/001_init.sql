BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  profile jsonb NOT NULL DEFAULT '{}',
  trial_started_at timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS guest_trials (
  network_key text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  subject text PRIMARY KEY,
  bucket bigint NOT NULL,
  hits integer NOT NULL CHECK (hits > 0)
);

CREATE TABLE IF NOT EXISTS premium_payments (
  checkout_id text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  paid_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_intents (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
