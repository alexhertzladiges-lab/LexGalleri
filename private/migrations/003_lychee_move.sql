-- Import into the LexGalleri database only. No Lychee schema or account changes.
-- Creates move-mode settings and a durable journal before any original is renamed.
CREATE TABLE IF NOT EXISTS lychee_import_transfer_jobs (
 job_id CHAR(32) NOT NULL PRIMARY KEY,
 mode VARCHAR(8) NULL,
 preview_revision INT NOT NULL DEFAULT 0,
 created VARCHAR(32) NOT NULL,
 updated VARCHAR(32) NOT NULL,
 FOREIGN KEY(job_id) REFERENCES lychee_import_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS lychee_import_move_files (
 id CHAR(32) NOT NULL PRIMARY KEY,
 job_id CHAR(32) NOT NULL,
 source_path_hash CHAR(64) NOT NULL,
 source_short_path TEXT NOT NULL,
 digest CHAR(64) NOT NULL,
 sha1 CHAR(40) NOT NULL,
 size BIGINT UNSIGNED NOT NULL,
 source_dev BIGINT NOT NULL,
 source_inode BIGINT UNSIGNED NOT NULL,
 state VARCHAR(16) NOT NULL,
 created VARCHAR(32) NOT NULL,
 updated VARCHAR(32) NOT NULL,
 UNIQUE KEY source_original(job_id,source_path_hash),
 KEY move_progress(job_id,state),
 FOREIGN KEY(job_id) REFERENCES lychee_import_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
