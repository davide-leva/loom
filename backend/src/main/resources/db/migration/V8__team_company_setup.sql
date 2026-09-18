ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS team_company BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_company_role_check;

UPDATE companies
SET team_company = TRUE
WHERE id = (
    SELECT id FROM companies ORDER BY id LIMIT 1
)
  AND NOT EXISTS (SELECT 1 FROM companies WHERE team_company = TRUE);

UPDATE users
SET company_id = (SELECT id FROM companies WHERE team_company = TRUE ORDER BY id LIMIT 1)
WHERE role IN ('TEAM', 'ADMIN')
  AND company_id IS NULL
  AND EXISTS (SELECT 1 FROM companies WHERE team_company = TRUE);

ALTER TABLE users
    ADD CONSTRAINT users_company_role_check CHECK (
        company_id IS NOT NULL
    );
