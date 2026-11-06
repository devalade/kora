CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_start` text NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
ALTER TABLE `issues` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `issues` ADD `description_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `issues_deleted_idx` ON `issues` (`workspace_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `attachments_uploader_idx` ON `attachments` (`uploader_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);