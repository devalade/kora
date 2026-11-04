ALTER TABLE `issues` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `issues` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `issues` ADD `parent_issue_id` text;--> statement-breakpoint
CREATE INDEX `issues_parent_idx` ON `issues` (`parent_issue_id`);--> statement-breakpoint
CREATE INDEX `issues_dates_idx` ON `issues` (`workspace_id`,`start_date`,`due_date`);