CREATE TABLE `feature_flags` (
	`name` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`notes` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_health` (
	`id` text PRIMARY KEY NOT NULL,
	`last_cron_tick_at` text,
	`last_reconciler_run_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "system_health_singleton" CHECK("system_health"."id" = 'singleton')
);
