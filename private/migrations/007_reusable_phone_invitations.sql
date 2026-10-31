-- LexGalleri: apply only to its existing database. No contacts are copied.
-- Requires migrations 004 and 006. Safe to rerun after completion or interruption.
ALTER TABLE users MODIFY email VARCHAR(254) NULL;
ALTER TABLE invitations MODIFY email VARCHAR(254) NULL;
SET @lg_sql = (SELECT IF(COUNT(*)=0, 'ALTER TABLE users ADD COLUMN phone VARCHAR(16) NULL UNIQUE', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='phone');
PREPARE lg_stmt FROM @lg_sql;
EXECUTE lg_stmt;
DEALLOCATE PREPARE lg_stmt;
SET @lg_sql = (SELECT IF(COUNT(*)=0, 'ALTER TABLE invitations ADD COLUMN phone VARCHAR(16) NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='invitations' AND column_name='phone');
PREPARE lg_stmt FROM @lg_sql;
EXECUTE lg_stmt;
DEALLOCATE PREPARE lg_stmt;
SET @lg_sql = (SELECT IF(COUNT(*)=0, 'ALTER TABLE invitations ADD COLUMN accepted_user_id CHAR(32) NULL', 'SELECT 1') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='invitations' AND column_name='accepted_user_id');
PREPARE lg_stmt FROM @lg_sql;
EXECUTE lg_stmt;
DEALLOCATE PREPARE lg_stmt;
INSERT INTO settings(`key`,value) VALUES('invitation_version','2') ON DUPLICATE KEY UPDATE value='2';
