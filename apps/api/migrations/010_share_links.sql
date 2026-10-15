-- Enlace público de sólo lectura por diagrama de la nube (ADR 106). Un token por diagrama: quitarlo corta el enlace
-- y volver a compartir genera otro, así un enlace viejo nunca vuelve a funcionar.
ALTER TABLE cloud_documents ADD COLUMN share_token text, ADD COLUMN shared_at timestamptz;
CREATE UNIQUE INDEX cloud_documents_share_idx ON cloud_documents(share_token) WHERE share_token IS NOT NULL;
