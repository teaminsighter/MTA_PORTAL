CREATE TABLE `ac_sync_map` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`d1_id` text NOT NULL,
	`ac_id` text NOT NULL,
	`last_pushed_at` text,
	`last_pulled_at` text,
	`last_hash` text,
	CONSTRAINT "sync_map_entity_check" CHECK("ac_sync_map"."entity_type" IN ('lead','contact','agent'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_map_entity_ac_unique` ON `ac_sync_map` (`entity_type`,`ac_id`);--> statement-breakpoint
CREATE TABLE `agent_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`name_raw` text NOT NULL,
	`name_normalised` text NOT NULL,
	`agency` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`first_seen_lead_id` text,
	`match_agent_id` text,
	`confidence` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`reason_hint` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`first_seen_lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`match_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "candidates_confidence_check" CHECK("agent_candidates"."confidence" IN ('high','medium','low')),
	CONSTRAINT "candidates_status_check" CHECK("agent_candidates"."status" IN ('new','contacted','promoted','dismissed'))
);
--> statement-breakpoint
CREATE INDEX `candidates_status_idx` ON `agent_candidates` (`status`);--> statement-breakpoint
CREATE TABLE `agent_contact_log` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text,
	`candidate_id` text,
	`lead_id` text,
	`channel` text NOT NULL,
	`outcome` text,
	`note` text,
	`by_user` text,
	`at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`candidate_id`) REFERENCES `agent_candidates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "contact_log_channel_check" CHECK("agent_contact_log"."channel" IN ('call','email','sms'))
);
--> statement-breakpoint
CREATE TABLE `agent_notification_status` (
	`lead_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`lead_id`, `agent_id`),
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notif_status_check" CHECK("agent_notification_status"."status" IN ('pending','sent','accepted','declined'))
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`agency` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`membership_status` text NOT NULL,
	`sms_permission` integer DEFAULT false NOT NULL,
	`sms_consent_at` text,
	`sms_consent_method` text,
	`signed_at` text,
	`signed_by` text,
	`notes` text,
	`sales_last_12mo` integer DEFAULT 0 NOT NULL,
	`avg_days_on_market` integer DEFAULT 0 NOT NULL,
	`nearby_sales` integer DEFAULT 0 NOT NULL,
	`reason_hint` text,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "agents_membership_check" CHECK("agents"."membership_status" IN ('signed','verbally_agreed','not_signed'))
);
--> statement-breakpoint
CREATE INDEX `agents_active_idx` ON `agents` (`active`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`lead_id` text,
	`before_json` text,
	`after_json` text,
	`at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_lead_at_idx` ON `audit_log` (`lead_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`step_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_message_id` text,
	`recipient` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`delivered_at` text,
	`opened_at` text,
	`clicked_at` text,
	`failed_at` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`step_id`) REFERENCES `dispatch_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dispatch_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`expected_lead_version` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_by` text,
	`locked_at` text,
	`lease_expires_at` text,
	`next_attempt_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "jobs_status_check" CHECK("dispatch_jobs"."status" IN ('pending','locked','failed_retry','sent','partial_send','replacement_required'))
);
--> statement-breakpoint
CREATE INDEX `jobs_status_next_idx` ON `dispatch_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `dispatch_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`seq` integer NOT NULL,
	`step_type` text NOT NULL,
	`parallel` integer DEFAULT false NOT NULL,
	`depends_on_seq` integer,
	`idempotency_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`payload_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `dispatch_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "steps_status_check" CHECK("dispatch_steps"."status" IN ('pending','in_progress','sent','failed','skipped')),
	CONSTRAINT "steps_type_check" CHECK("dispatch_steps"."step_type" IN ('vendor_email','agent_email','agent_sms','ac_contact_upsert','ac_deal_create','ac_deal_stage_update','ac_deal_note','ac_outcome_update'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `steps_job_seq_unique` ON `dispatch_steps` (`job_id`,`seq`);--> statement-breakpoint
CREATE TABLE `lead_agent_picks` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`reason_note` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`picked_by` text,
	`picked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`unpicked_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `picks_lead_agent_unique` ON `lead_agent_picks` (`lead_id`,`agent_id`);--> statement-breakpoint
CREATE TABLE `lead_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`outcome` text NOT NULL,
	`winning_agent_id` text,
	`winning_agent_name` text,
	`sale_price` integer,
	`referral_amount` integer,
	`recorded_by` text,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ac_synced_at` text,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`winning_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "outcomes_check" CHECK("lead_outcomes"."outcome" IN ('no_response','agent_appointed','listed','sold','referral_invoiced','referral_paid','lost'))
);
--> statement-breakpoint
CREATE INDEX `outcomes_lead_idx` ON `lead_outcomes` (`lead_id`);--> statement-breakpoint
CREATE INDEX `outcomes_recorded_idx` ON `lead_outcomes` (`recorded_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`d1_lead_id` text NOT NULL,
	`address_raw` text NOT NULL,
	`address_normalised` text NOT NULL,
	`vendor_name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`webhook_idempotency_key` text,
	CONSTRAINT "leads_source_check" CHECK("leads"."source" IN ('web','ac_import','ac_manual','seed_placeholder')),
	CONSTRAINT "leads_state_check" CHECK("leads"."state" IN ('received','enriching','ready_for_review','dispatching','sent','partial_send','awaiting_agent_responses','agent_appointed','listed','sold'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_d1_lead_id_unique` ON `leads` (`d1_lead_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `leads_webhook_idempotency_key_unique` ON `leads` (`webhook_idempotency_key`) WHERE "leads"."webhook_idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `leads_state_idx` ON `leads` (`state`);--> statement-breakpoint
CREATE INDEX `leads_created_at_idx` ON `leads` (`created_at`);--> statement-breakpoint
CREATE TABLE `properties` (
	`lead_id` text PRIMARY KEY NOT NULL,
	`cv` integer,
	`cv_source` text,
	`cv_fetched_at` text,
	`land_value` integer,
	`land_value_source` text,
	`land_value_fetched_at` text,
	`improvements` integer,
	`improvements_source` text,
	`improvements_fetched_at` text,
	`estimate` integer,
	`estimate_source` text,
	`estimate_fetched_at` text,
	`land_area` integer,
	`land_area_source` text,
	`land_area_fetched_at` text,
	`floor_area` integer,
	`floor_area_source` text,
	`floor_area_fetched_at` text,
	`bedrooms` integer,
	`bedrooms_source` text,
	`bedrooms_fetched_at` text,
	`year_built` integer,
	`year_built_source` text,
	`year_built_fetched_at` text,
	`last_sold_date` text,
	`last_sold_date_source` text,
	`last_sold_date_fetched_at` text,
	`last_sold_price` integer,
	`last_sold_price_source` text,
	`last_sold_price_fetched_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `property_comparables` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`address` text NOT NULL,
	`sale_price` integer NOT NULL,
	`sale_date` text NOT NULL,
	`distance_m` integer DEFAULT 0 NOT NULL,
	`cv_at_sale` integer DEFAULT 0 NOT NULL,
	`agent_name_raw` text,
	`agency_raw` text,
	`matched_agent_id` text,
	`source` text NOT NULL,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comparables_lead_idx` ON `property_comparables` (`lead_id`);--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`field` text NOT NULL,
	`d1_value` text,
	`ac_value` text,
	`detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_by` text,
	`resolution` text,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ac_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`ac_entity_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`applied_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	CONSTRAINT "sync_events_status_check" CHECK("sync_events"."status" IN ('pending','applied','skipped','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_events_ac_event_unique` ON `sync_events` (`ac_event_id`);--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_key` text NOT NULL,
	`version` integer NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_key_version_unique` ON `template_versions` (`template_key`,`version`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`google_sub` text,
	`role` text DEFAULT 'readonly' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_login_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('consultant','admin','readonly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);