CREATE TABLE `office_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `office_activities_workspace_idx` ON `office_activities` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `office_presence` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`zone` text DEFAULT 'floor' NOT NULL,
	`x` integer DEFAULT 50 NOT NULL,
	`y` integer DEFAULT 55 NOT NULL,
	`activity` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
