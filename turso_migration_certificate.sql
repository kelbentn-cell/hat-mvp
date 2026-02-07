ALTER TABLE tokens ADD COLUMN user_identifier TEXT;
ALTER TABLE tokens ADD COLUMN certificate_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_user_identifier ON tokens(user_identifier);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_certificate_number ON tokens(certificate_number);

UPDATE tokens
SET user_identifier = 'HAT-UID-' || upper(hex(randomblob(6)))
WHERE user_identifier IS NULL;

UPDATE tokens
SET certificate_number = 'HAT-CERT-' || printf('%06d', id)
WHERE certificate_number IS NULL;
