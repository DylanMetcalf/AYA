CREATE TYPE "public"."brand_kind" AS ENUM('operating', 'trading', 'partner');--> statement-breakpoint
CREATE TYPE "public"."company_group_role" AS ENUM('central_operator', 'group_company', 'connected_partner', 'supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."rate_basis" AS ENUM('per_person', 'per_person_sharing', 'per_room_per_night', 'per_room_per_stay', 'per_vehicle_per_day', 'per_vehicle_per_km', 'per_transfer', 'per_flight', 'per_hour', 'per_guide_per_day', 'per_activity', 'per_group', 'per_item', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."rate_status" AS ENUM('draft', 'pending_review', 'approved', 'superseded', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."rate_type" AS ENUM('public', 'supplier_provided', 'trade', 'contracted', 'indicative', 'manual_estimate');--> statement-breakpoint
CREATE TYPE "public"."supplier_category" AS ENUM('lodge', 'camp', 'accommodation', 'restaurant', 'private_chef', 'guide', 'host', 'helicopter', 'aviation', 'vehicle_partner', 'transfer', 'activity', 'conservation', 'amenity', 'event', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'verified', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."trip_assignment_role" AS ENUM('trip_manager', 'operations', 'guide', 'driver', 'host', 'finance');--> statement-breakpoint
CREATE TYPE "public"."trip_brand_role" AS ENUM('participating', 'supplying');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('enquiry', 'discovery', 'concept', 'draft_itinerary', 'costing', 'internal_review', 'quote_ready', 'quote_issued', 'awaiting_decision', 'provisional_hold', 'confirmed', 'pre_trip', 'in_progress', 'completed', 'reconciliation', 'closed', 'cancelled', 'lost');--> statement-breakpoint
CREATE SEQUENCE "public"."trip_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"category" varchar(20) DEFAULT 'business' NOT NULL,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"summary" text NOT NULL,
	"changes" jsonb
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" "brand_kind" NOT NULL,
	"legal_company_id" uuid,
	"tagline" varchar(200),
	"description" text,
	"color_primary" varchar(7) NOT NULL,
	"color_secondary" varchar(7) NOT NULL,
	"color_accent" varchar(7) NOT NULL,
	"contact_email" varchar(200),
	"contact_phone" varchar(50),
	"website" varchar(200),
	"document_footer" text,
	"is_provisional" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"registration_number" varchar(100),
	"vat_number" varchar(100),
	"country" varchar(2) DEFAULT 'ZA' NOT NULL,
	"address" text,
	"base_currency" varchar(3) DEFAULT 'ZAR' NOT NULL,
	"group_role" "company_group_role" DEFAULT 'other' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" varchar(80) NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"name" varchar(120) NOT NULL,
	"password_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"kind" varchar(30) DEFAULT 'company' NOT NULL,
	"email" varchar(254),
	"phone" varchar(50),
	"country" varchar(2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(254),
	"phone" varchar(50),
	"nationality" varchar(2),
	"client_organisation_id" uuid,
	"preferences" text,
	"dietary" text,
	"accessibility" text,
	"medical_notes" text,
	"relationship_notes" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"role" varchar(120),
	"email" varchar(254),
	"phone" varchar(50),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"lineage_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" varchar(200) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"basis" "rate_basis" NOT NULL,
	"minimum_charge" numeric(14, 2),
	"minimum_nights" integer,
	"valid_from" date,
	"valid_to" date,
	"season" varchar(80),
	"occupancy_note" varchar(200),
	"inclusions" text,
	"exclusions" text,
	"type" "rate_type" NOT NULL,
	"status" "rate_status" DEFAULT 'draft' NOT NULL,
	"source" varchar(300) NOT NULL,
	"obtained_on" date,
	"verified_on" date,
	"internal_notes" text,
	"created_by_id" uuid,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"component_type" varchar(40) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"category" "supplier_category" NOT NULL,
	"legal_company_id" uuid,
	"email" varchar(254),
	"phone" varchar(50),
	"website" varchar(300),
	"location" varchar(200),
	"region" varchar(120),
	"description" text,
	"payment_terms" text,
	"cancellation_terms" text,
	"default_currency" varchar(3) DEFAULT 'ZAR' NOT NULL,
	"verification" "verification_status" DEFAULT 'unverified' NOT NULL,
	"internal_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_assignments" (
	"trip_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "trip_assignment_role" NOT NULL,
	CONSTRAINT "trip_assignments_trip_id_user_id_role_pk" PRIMARY KEY("trip_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "trip_brands" (
	"trip_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"role" "trip_brand_role" NOT NULL,
	"note" varchar(200),
	CONSTRAINT "trip_brands_trip_id_brand_id_role_pk" PRIMARY KEY("trip_id","brand_id","role")
);
--> statement-breakpoint
CREATE TABLE "trip_guests" (
	"trip_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"traveller_type" varchar(10) DEFAULT 'adult' NOT NULL,
	CONSTRAINT "trip_guests_trip_id_guest_id_pk" PRIMARY KEY("trip_id","guest_id")
);
--> statement-breakpoint
CREATE TABLE "trip_status_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"from_status" "trip_status",
	"to_status" "trip_status" NOT NULL,
	"reason" text,
	"overridden" boolean DEFAULT false NOT NULL,
	"overridden_rules" text,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "trip_status" DEFAULT 'enquiry' NOT NULL,
	"lead_guest_id" uuid,
	"client_organisation_id" uuid,
	"primary_brand_id" uuid NOT NULL,
	"guest_facing_brand_id" uuid NOT NULL,
	"operating_company_id" uuid,
	"quoting_company_id" uuid,
	"manager_id" uuid,
	"start_date" date,
	"end_date" date,
	"adults" integer DEFAULT 2 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"rooms" integer DEFAULT 1 NOT NULL,
	"primary_destination" varchar(200),
	"purpose" varchar(200),
	"occasion" varchar(200),
	"experience_style" varchar(200),
	"enquiry_source" varchar(120),
	"currency" varchar(3) DEFAULT 'ZAR' NOT NULL,
	"estimated_value" numeric(14, 2),
	"internal_notes" text,
	"guest_notes" text,
	"special_requirements" text,
	"commercial_approved_at" timestamp with time zone,
	"commercial_approved_by_id" uuid,
	"closing_reason" text,
	"archived_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_dates_ck" CHECK ("trips"."end_date" is null or "trips"."start_date" is null or "trips"."end_date" >= "trips"."start_date"),
	CONSTRAINT "trips_party_ck" CHECK ("trips"."adults" >= 0 and "trips"."children" >= 0 and "trips"."rooms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_legal_company_id_legal_companies_id_fk" FOREIGN KEY ("legal_company_id") REFERENCES "public"."legal_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_client_organisation_id_client_organisations_id_fk" FOREIGN KEY ("client_organisation_id") REFERENCES "public"."client_organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rates" ADD CONSTRAINT "supplier_rates_service_id_supplier_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."supplier_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rates" ADD CONSTRAINT "supplier_rates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rates" ADD CONSTRAINT "supplier_rates_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_services" ADD CONSTRAINT "supplier_services_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_legal_company_id_legal_companies_id_fk" FOREIGN KEY ("legal_company_id") REFERENCES "public"."legal_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_brands" ADD CONSTRAINT "trip_brands_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_brands" ADD CONSTRAINT "trip_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_guests" ADD CONSTRAINT "trip_guests_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_guests" ADD CONSTRAINT "trip_guests_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_status_history" ADD CONSTRAINT "trip_status_history_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_status_history" ADD CONSTRAINT "trip_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_lead_guest_id_guests_id_fk" FOREIGN KEY ("lead_guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_client_organisation_id_client_organisations_id_fk" FOREIGN KEY ("client_organisation_id") REFERENCES "public"."client_organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_primary_brand_id_brands_id_fk" FOREIGN KEY ("primary_brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_guest_facing_brand_id_brands_id_fk" FOREIGN KEY ("guest_facing_brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_operating_company_id_legal_companies_id_fk" FOREIGN KEY ("operating_company_id") REFERENCES "public"."legal_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_quoting_company_id_legal_companies_id_fk" FOREIGN KEY ("quoting_company_id") REFERENCES "public"."legal_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_commercial_approved_by_id_users_id_fk" FOREIGN KEY ("commercial_approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_uq" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_uq" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_uq" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "guests_name_idx" ON "guests" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_rates_lineage_version_uq" ON "supplier_rates" USING btree ("lineage_id","version");--> statement-breakpoint
CREATE INDEX "supplier_rates_service_idx" ON "supplier_rates" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "trip_assign_user_idx" ON "trip_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trip_status_hist_trip_idx" ON "trip_status_history" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_reference_uq" ON "trips" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "trips_status_idx" ON "trips" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trips_start_idx" ON "trips" USING btree ("start_date");