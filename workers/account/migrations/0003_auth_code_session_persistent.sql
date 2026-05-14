ALTER TABLE auth_codes
ADD COLUMN session_persistent INTEGER NOT NULL CHECK (session_persistent IN (0, 1)) DEFAULT 1;
