CREATE TABLE users (
  id text PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner_id text NOT NULL UNIQUE REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_memberships (
  project_id text NOT NULL REFERENCES projects(id),
  user_id text NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  PRIMARY KEY (project_id,user_id)
);

CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);

CREATE TABLE cloud_documents (
  document_id text PRIMARY KEY REFERENCES documents(id),
  project_id text NOT NULL REFERENCES projects(id),
  public_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cloud_documents_project_idx ON cloud_documents(project_id);
CREATE UNIQUE INDEX cloud_documents_public_idx ON cloud_documents(project_id,public_id);

CREATE TABLE ai_credit_receipts (
  user_id text NOT NULL REFERENCES users(id),
  request_id text NOT NULL,
  fingerprint text NOT NULL,
  credits smallint NOT NULL CHECK (credits IN (1,2)),
  status text NOT NULL CHECK (status IN ('reserved','committed','released')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,request_id)
);
CREATE INDEX ai_credit_receipts_period_idx ON ai_credit_receipts(user_id,created_at) WHERE status <> 'released';
