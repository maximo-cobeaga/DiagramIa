-- Los pedidos de administradores conservan idempotencia durable sin consumir créditos Free.
ALTER TABLE ai_credit_receipts DROP CONSTRAINT ai_credit_receipts_credits_check;
ALTER TABLE ai_credit_receipts ADD CONSTRAINT ai_credit_receipts_credits_check CHECK (credits IN (0,1,2));
