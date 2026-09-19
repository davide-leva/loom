ALTER TABLE companies ADD COLUMN primary_color VARCHAR(16) NOT NULL DEFAULT 'blue';
ALTER TABLE companies ADD COLUMN logo_extension VARCHAR(8);
ALTER TABLE projects ADD COLUMN logo_extension VARCHAR(8);
