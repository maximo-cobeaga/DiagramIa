-- Consultas del plan Empresas que llegan desde el formulario de la landing. Es una bandeja: se lee y se responde por email;
-- no hay cuenta asociada. La limitación por IP vive sólo en memoria del gateway.
CREATE TABLE contact_requests (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL,
  team_size text,
  message text NOT NULL,
  source text NOT NULL DEFAULT 'landing',
  status text NOT NULL DEFAULT 'new'
);

CREATE INDEX contact_requests_created_idx ON contact_requests (created_at DESC);
