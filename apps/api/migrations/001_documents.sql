CREATE TABLE documents (
  id text PRIMARY KEY,
  revision integer NOT NULL CHECK (revision >= 0),
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_versions (
  document_id text NOT NULL REFERENCES documents(id),
  revision integer NOT NULL CHECK (revision >= 0),
  body jsonb NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'batch', 'restore')),
  operation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, revision)
);

CREATE TABLE document_receipts (
  document_id text NOT NULL REFERENCES documents(id),
  operation_id text NOT NULL,
  fingerprint text NOT NULL,
  applied_revision integer NOT NULL,
  operation text NOT NULL CHECK (operation IN ('batch', 'restore')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, operation_id),
  FOREIGN KEY (document_id, applied_revision) REFERENCES document_versions(document_id, revision)
);

CREATE TABLE document_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id),
  revision integer NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'batch', 'restore')),
  operation_id text,
  actor_id text,
  source_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (document_id, revision) REFERENCES document_versions(document_id, revision)
);
CREATE INDEX document_audit_document_idx ON document_audit(document_id, id);
