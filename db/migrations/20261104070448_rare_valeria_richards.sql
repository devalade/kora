CREATE TABLE `task_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'unstarted' NOT NULL,
	`color` text DEFAULT '#736f66' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_statuses_workspace_name_idx` ON `task_statuses` (`workspace_id`,`name`);--> statement-breakpoint
CREATE INDEX `task_statuses_workspace_position_idx` ON `task_statuses` (`workspace_id`,`position`);