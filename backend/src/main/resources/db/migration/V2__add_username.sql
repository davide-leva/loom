ALTER TABLE users ADD COLUMN username VARCHAR(64);

-- Per gli account già presenti il nome provvisorio è stabile e univoco.
UPDATE users SET username = 'user_' || id;
UPDATE users SET username = 'admin'
WHERE id = (SELECT MIN(id) FROM users WHERE role = 'ADMIN');

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX users_username_lower_unique ON users (LOWER(username));
