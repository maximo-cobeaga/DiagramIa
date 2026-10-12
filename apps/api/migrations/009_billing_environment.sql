-- Entorno de Paddle del que viene cada suscripción (ADR 098). Hasta este cambio el cobro sólo funcionó contra el sandbox,
-- así que las filas existentes son de prueba. Al pasar a cobros reales, una suscripción de prueba no debe seguir dando Pro.
ALTER TABLE subscriptions ADD COLUMN environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live'));
