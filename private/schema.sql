CREATE TABLE IF NOT EXISTS users (
 id CHAR(32) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL,
 password VARCHAR(255) NOT NULL, admin TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS galleries (
 id CHAR(32) PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT NOT NULL, created VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS grants (
 gallery_id CHAR(32) NOT NULL, user_id CHAR(32) NOT NULL, upload TINYINT NOT NULL DEFAULT 0,
 download TINYINT NOT NULL DEFAULT 0, gps TINYINT NOT NULL DEFAULT 0,
 PRIMARY KEY(gallery_id,user_id), FOREIGN KEY(gallery_id) REFERENCES galleries(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS invitations (
 token CHAR(64) PRIMARY KEY, email VARCHAR(254) NOT NULL, name VARCHAR(100) NOT NULL,
 gallery_id CHAR(32) NOT NULL, upload TINYINT NOT NULL DEFAULT 0, download TINYINT NOT NULL DEFAULT 0,
 gps TINYINT NOT NULL DEFAULT 0, expires BIGINT NOT NULL,
 FOREIGN KEY(gallery_id) REFERENCES galleries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS photos (
 id CHAR(32) PRIMARY KEY, gallery_id CHAR(32) NOT NULL, title VARCHAR(200) NOT NULL,
 filename VARCHAR(255) NOT NULL, mime VARCHAR(50) NOT NULL, uploader CHAR(32) NOT NULL,
 uploaded VARCHAR(32) NOT NULL, taken VARCHAR(32) NOT NULL, `precision` VARCHAR(16) NOT NULL,
 place VARCHAR(200) NOT NULL, lat DOUBLE NULL, lon DOUBLE NULL, digest CHAR(64) NOT NULL,
 UNIQUE KEY gallery_digest(gallery_id,digest), KEY gallery_uploaded(gallery_id,uploaded),
 FOREIGN KEY(gallery_id) REFERENCES galleries(id), FOREIGN KEY(uploader) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS settings (`key` VARCHAR(50) PRIMARY KEY, value MEDIUMTEXT NOT NULL)
 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS themes (id CHAR(32) PRIMARY KEY, document TEXT NOT NULL)
 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS favorites (
 photo_id CHAR(32) NOT NULL,user_id CHAR(32) NOT NULL, PRIMARY KEY(photo_id,user_id),
 FOREIGN KEY(photo_id) REFERENCES photos(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS login_limits (
 bucket CHAR(64) PRIMARY KEY, attempts INT NOT NULL DEFAULT 1, expires BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS user_security (
 user_id CHAR(32) PRIMARY KEY,
 session_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
 totp_secret TEXT NULL,
 totp_last_step BIGINT NOT NULL DEFAULT -1,
 totp_enabled TINYINT NOT NULL DEFAULT 0,
 created VARCHAR(32) NOT NULL,
 updated VARCHAR(32) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS user_recovery_codes (
 id CHAR(32) PRIMARY KEY,
 user_id CHAR(32) NOT NULL,
 code_hash CHAR(64) NOT NULL,
 used_at VARCHAR(32) NULL,
 created VARCHAR(32) NOT NULL,
 UNIQUE KEY user_recovery_hash(user_id,code_hash),
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS media_delete_requests (
 id CHAR(32) PRIMARY KEY,
 photo_id CHAR(32) NOT NULL,
 gallery_id CHAR(32) NOT NULL,
 gallery_name VARCHAR(100) NOT NULL,
 requester_id CHAR(32) NOT NULL,
 requester_name VARCHAR(100) NOT NULL,
 title VARCHAR(200) NOT NULL,
 mime VARCHAR(50) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending',
 created VARCHAR(32) NOT NULL,
 updated VARCHAR(32) NOT NULL,
 resolved_by CHAR(32) NULL,
 resolved_at VARCHAR(32) NULL,
 KEY media_delete_pending (status,created),
 KEY media_delete_photo (photo_id,status),
 KEY media_delete_requester (requester_id,created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
