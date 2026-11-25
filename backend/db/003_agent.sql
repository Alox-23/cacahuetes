BEGIN;

-- Feature 5: conversation memory of the agent, per owner (account id or guest:<sha256>).
CREATE TABLE IF NOT EXISTS agent_turns (
  id bigserial PRIMARY KEY,
  owner_key text NOT NULL,
  route_id uuid,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_turns_owner_idx ON agent_turns(owner_key, id DESC);

COMMIT;
