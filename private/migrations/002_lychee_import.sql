-- Import only into the LexGalleri database via phpMyAdmin. No changes to Lychee.
CREATE TABLE IF NOT EXISTS lychee_import_jobs (
 id CHAR(32) PRIMARY KEY, source_key CHAR(64) NOT NULL UNIQUE,
 source_version VARCHAR(16) NOT NULL, state VARCHAR(16) NOT NULL,
 cursor_photo VARCHAR(24) NOT NULL DEFAULT '', source_photo_count BIGINT NOT NULL DEFAULT 0,
 created_by CHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL, created VARCHAR(32) NOT NULL, updated VARCHAR(32) NOT NULL,
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS lychee_import_albums (
 job_id CHAR(32) NOT NULL, source_id VARCHAR(24) NOT NULL,
 parent_id VARCHAR(24) NULL, title TEXT NOT NULL, description LONGTEXT NOT NULL,
 path TEXT NOT NULL, source_metadata LONGTEXT NOT NULL,
 target_gallery_id CHAR(32) COLLATE utf8mb4_unicode_ci NULL,
 PRIMARY KEY(job_id,source_id), FOREIGN KEY(job_id) REFERENCES lychee_import_jobs(id),
 FOREIGN KEY(target_gallery_id) REFERENCES galleries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS lychee_import_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 job_id CHAR(32) NOT NULL, source_photo_id VARCHAR(24) NOT NULL,
 source_album_id VARCHAR(24) NOT NULL, status VARCHAR(16) NOT NULL,
 target_photo_id CHAR(32) COLLATE utf8mb4_unicode_ci NULL, planned_photo_id CHAR(32) NULL, source_metadata LONGTEXT NOT NULL,
 error VARCHAR(500) NOT NULL DEFAULT '', updated VARCHAR(32) NOT NULL,
 UNIQUE KEY source_membership(job_id,source_photo_id,source_album_id),
 KEY pending_work(job_id,status,id),
 FOREIGN KEY(job_id) REFERENCES lychee_import_jobs(id),
 FOREIGN KEY(target_photo_id) REFERENCES photos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
