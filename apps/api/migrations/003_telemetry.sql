-- Telemetría de producto (ADR 046). Eventos sin contenido de diagramas, prompts ni secretos.
CREATE TABLE telemetry_events (
  id uuid PRIMARY KEY,
  origin text NOT NULL CHECK (origin IN ('client','server')),
  name text NOT NULL,
  anonymous_id uuid,
  session_id uuid,
  user_id text REFERENCES users(id),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  props jsonb NOT NULL DEFAULT '{}',
  context jsonb,
  CHECK (origin = 'server' OR (anonymous_id IS NOT NULL AND session_id IS NOT NULL))
);
CREATE INDEX telemetry_events_name_time_idx ON telemetry_events(name, occurred_at);
CREATE INDEX telemetry_events_anonymous_idx ON telemetry_events(anonymous_id, occurred_at) WHERE anonymous_id IS NOT NULL;
CREATE INDEX telemetry_events_user_idx ON telemetry_events(user_id, occurred_at) WHERE user_id IS NOT NULL;

-- Vínculo visitante anónimo → cuenta. El primer vínculo de un navegador se conserva.
CREATE TABLE telemetry_identities (
  anonymous_id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telemetry_identities_user_idx ON telemetry_identities(user_id);
