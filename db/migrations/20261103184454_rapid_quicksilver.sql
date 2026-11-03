CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`uploader_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_message_idx` ON `attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `call_participants` (
	`call_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`left_at` text,
	`muted` integer DEFAULT false NOT NULL,
	`camera_on` integer DEFAULT true NOT NULL,
	`sharing` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`call_id`, `user_id`),
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `call_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `call_signals_inbox_idx` ON `call_signals` (`call_id`,`to_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`started_by` text NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`ended_at` text,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`started_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `calls_channel_idx` ON `calls` (`channel_id`,`ended_at`);--> statement-breakpoint
CREATE TABLE `channel_members` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`typing_at` text,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`channel_id`, `user_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channel_members_user_idx` ON `channel_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'public' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `channels_workspace_idx` ON `channels` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_workspace_name_idx` ON `channels` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`parent_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`edited_at` text,
	`deleted_at` text,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_channel_idx` ON `messages` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_parent_idx` ON `messages` (`parent_id`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`, `emoji`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`avatar_color` text DEFAULT '#D97757' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status_emoji` text DEFAULT '' NOT NULL,
	`status_text` text DEFAULT '' NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`invite_code` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_invite_code_unique` ON `workspaces` (`invite_code`);