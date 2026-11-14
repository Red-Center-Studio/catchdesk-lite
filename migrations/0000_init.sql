CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`business_name` text DEFAULT 'My Business' NOT NULL,
	`support_email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`setup_help_url` text DEFAULT 'https://redcenterstudio.com/products/catchdesk/' NOT NULL,
	`show_setup_offer` integer DEFAULT true NOT NULL,
	`time_zone` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`tax_label` text DEFAULT 'Tax' NOT NULL,
	`tax_rate_bp` integer DEFAULT 0 NOT NULL,
	`prices_include_tax` integer DEFAULT false NOT NULL,
	`quote_valid_days` integer DEFAULT 30 NOT NULL,
	`enquiry_intro` text DEFAULT 'Tell us what you need. Add a few photos if you can, and we will reply with a quote.' NOT NULL,
	`notify_new_lead` integer DEFAULT true NOT NULL,
	`last_lead_number` integer DEFAULT 1000 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "app_settings_single_row" CHECK("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `lead` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`public_token` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`source` text DEFAULT 'form' NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text DEFAULT '' NOT NULL,
	`customer_phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`service_id` text,
	`service_name` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`urgency` text DEFAULT 'flexible' NOT NULL,
	`preferred_time` text DEFAULT '' NOT NULL,
	`internal_notes` text DEFAULT '' NOT NULL,
	`scheduled_for` text,
	`lost_reason` text DEFAULT '' NOT NULL,
	`quote_summary` text DEFAULT '' NOT NULL,
	`quote_valid_until` text,
	`quote_sent_at` text,
	`accepted_at` text,
	`accepted_name` text DEFAULT '' NOT NULL,
	`customer_reply` text DEFAULT '' NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`done_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "lead_status_check" CHECK("lead"."status" IN ('new', 'needs_info', 'quoted', 'accepted', 'booked', 'done', 'lost'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lead_token_idx` ON `lead` (`public_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `lead_number_idx` ON `lead` (`number`);--> statement-breakpoint
CREATE INDEX `lead_status_created_idx` ON `lead` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `lead_event` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`actor_name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_event_lead_idx` ON `lead_event` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `lead_photo` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_photo_lead_idx` ON `lead_photo` (`lead_id`);--> statement-breakpoint
CREATE TABLE `quote_item` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`description` text NOT NULL,
	`qty_hundredths` integer DEFAULT 100 NOT NULL,
	`unit_cents` integer DEFAULT 0 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quote_item_lead_idx` ON `quote_item` (`lead_id`);--> statement-breakpoint
CREATE TABLE `service` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`base_price_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "user_role_check" CHECK("user"."role" IS NULL OR "user"."role" IN ('admin', 'staff'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);