-- Suscripción de cada cuenta (ADR 089). Una fila por usuario; el plan se deduce del estado, no se guarda aparte.
-- El proveedor de cobro (Paddle) es un detalle de las columnas paddle_*: la lógica de planes sólo mira `status` y `current_period_end`.
CREATE TABLE subscriptions (
  user_id text PRIMARY KEY REFERENCES users(id),
  provider text NOT NULL DEFAULT 'paddle',
  provider_customer_id text,
  provider_subscription_id text NOT NULL UNIQUE,
  price_id text,
  status text NOT NULL,
  current_period_end timestamptz,
  scheduled_cancel_at timestamptz,
  update_payment_url text,
  cancel_url text,
  last_event_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Avisos del proveedor ya procesados: un reenvío del mismo evento no cambia nada.
CREATE TABLE billing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
