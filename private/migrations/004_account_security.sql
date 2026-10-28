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
