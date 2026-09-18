-- Company users belong to every project linked to their company through the
-- projects.company_id / users.company_id relationship. Keep projects_users
-- only for explicit memberships that are not covered by that automatic link.
DELETE FROM projects_users pu
USING users u
WHERE pu.user_id = u.id
  AND u.role IN ('USER', 'SUPERUSER')
  AND EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = pu.project_id
        AND p.company_id = u.company_id
  );

CREATE INDEX IF NOT EXISTS users_company_id_idx ON users (company_id);
CREATE INDEX IF NOT EXISTS projects_company_id_idx ON projects (company_id);
