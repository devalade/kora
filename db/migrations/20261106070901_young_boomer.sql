CREATE TABLE `github_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text DEFAULT 'Organization' NOT NULL,
	`connected_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `github_installations_workspace_idx` ON `github_installations` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `github_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`open_status_id` text,
	`review_status_id` text,
	`merge_status_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`open_status_id`) REFERENCES `task_statuses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`review_status_id`) REFERENCES `task_statuses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`merge_status_id`) REFERENCES `task_statuses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `issue_links` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`repo` text NOT NULL,
	`number` integer NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`review` text,
	`author_login` text DEFAULT '' NOT NULL,
	`branch` text DEFAULT '' NOT NULL,
	`closes` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issue_links_issue_pr_idx` ON `issue_links` (`issue_id`,`repo`,`number`);--> statement-breakpoint
CREATE INDEX `issue_links_pr_idx` ON `issue_links` (`workspace_id`,`repo`,`number`);