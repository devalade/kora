CREATE TABLE `link_previews` (
	`url` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_url` text,
	`site_name` text DEFAULT '' NOT NULL,
	`domain` text DEFAULT '' NOT NULL,
	`fetched_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
