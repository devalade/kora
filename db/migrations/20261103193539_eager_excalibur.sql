-- void:allow-destructive
DROP INDEX `channels_workspace_name_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `channels_workspace_name_idx` ON `channels` (`workspace_id`,`name`) WHERE "channels"."kind" <> 'dm';