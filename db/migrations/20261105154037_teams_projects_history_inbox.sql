-- void:allow-destructive
-- Flagged because it renames a table and a column and drops two indexes. No rows are removed:
-- the renames keep all data and the dropped indexes are recreated under their new names below.
-- Today's "projects" own the issue key, which is what Linear calls a team. Rename in place:
-- ALTER TABLE ... RENAME keeps every row and rewrites foreign keys that point at the table,
-- so no table is rebuilt and nothing cascades.
ALTER TABLE `projects` RENAME TO `teams`;--> statement-breakpoint
DROP INDEX IF EXISTS `projects_workspace_key_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `projects_workspace_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `teams_workspace_key_idx` ON `teams` (`workspace_id`,`key`);--> statement-breakpoint
CREATE INDEX `teams_workspace_idx` ON `teams` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `issues` RENAME COLUMN `project_id` TO `team_id`;--> statement-breakpoint
DROP INDEX IF EXISTS `issues_project_number_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `issues_team_number_idx` ON `issues` (`team_id`,`number`);--> statement-breakpoint

-- Projects, Linear-style: optional groupings of issues across teams.
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#5B8DEF' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`lead_id` text,
	`start_date` text,
	`target_date` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `projects_workspace_idx` ON `projects` (`workspace_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `issues` ADD `project_id` text REFERENCES projects(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `issues_project_idx` ON `issues` (`project_id`);--> statement-breakpoint

CREATE TABLE `issue_events` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`actor_id` text,
	`kind` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX `issue_events_issue_idx` ON `issue_events` (`issue_id`,`created_at`);--> statement-breakpoint

CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_id` text,
	`kind` text NOT NULL,
	`issue_id` text,
	`channel_id` text,
	`message_id` text,
	`body` text DEFAULT '' NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_unread_idx` ON `notifications` (`user_id`,`read_at`);
