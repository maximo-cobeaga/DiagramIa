-- Agregados y dashboard del fundador (P7.3).
CREATE INDEX telemetry_events_time_idx ON telemetry_events(occurred_at);

-- Quién hizo cada evento: la cuenta si se conoce (directa o por vínculo del navegador), si no el visitante anónimo.
CREATE VIEW telemetry_facts AS
SELECT e.id, e.origin, e.name, e.anonymous_id, e.occurred_at, e.props,
       (e.occurred_at AT TIME ZONE 'UTC')::date AS day,
       COALESCE(e.user_id, i.user_id, e.anonymous_id::text) AS actor
FROM telemetry_events e LEFT JOIN telemetry_identities i ON i.anonymous_id = e.anonymous_id;

-- Un registro por día UTC con métricas sumables. Lo usan el dashboard y el futuro agente Data/Product.
CREATE TABLE telemetry_daily (
  day date PRIMARY KEY,
  metrics jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
