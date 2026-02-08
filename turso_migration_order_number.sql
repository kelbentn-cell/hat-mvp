ALTER TABLE tokens ADD COLUMN order_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_order_number ON tokens(order_number);
