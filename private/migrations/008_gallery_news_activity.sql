-- LexGalleri: new-media receipts and 30-day login/gallery activity.
-- Re-runnable. No existing photo, account or password is changed.
CREATE TABLE IF NOT EXISTS activity_users (
 user_id CHAR(32) PRIMARY KEY, initialized_at DATETIME(6) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS media_seen (
 user_id CHAR(32) NOT NULL, photo_id CHAR(32) NOT NULL, seen_at DATETIME(6) NOT NULL,
 PRIMARY KEY(user_id,photo_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS activity_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id CHAR(32) NOT NULL, kind VARCHAR(16) NOT NULL, gallery_id CHAR(32) NULL,
 occurred_at DATETIME(6) NOT NULL, event_key CHAR(64) NOT NULL UNIQUE,
 KEY activity_time(occurred_at), KEY activity_user(user_id,occurred_at),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Apply the approved warm photo-album palette once. Re-running preserves any
-- later theme choice made by the administrator.
SET @lg_palette_first = (SELECT COUNT(*)=0 FROM settings WHERE `key`='compact_style_v1');
SET @lg_palette_json = '{"version":1,"name":"Varmt fotoalbum","colors":{"background":"#f8f4ed","surface":"#fffcf8","text":"#253d33","accent":"#a54f3d"},"font":"sans","radius":14,"density":"compact"}';
INSERT IGNORE INTO themes(id,document) VALUES('6c657867616c6c657269636f6d70616374',@lg_palette_json);
INSERT INTO settings(`key`,value) SELECT 'theme',@lg_palette_json WHERE @lg_palette_first
 ON DUPLICATE KEY UPDATE value=IF(@lg_palette_first,VALUES(value),value);
INSERT IGNORE INTO settings(`key`,value) VALUES('compact_style_v1','1');
