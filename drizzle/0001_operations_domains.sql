CREATE TYPE "public"."booking_status" AS ENUM('planned', 'requested', 'provisional', 'confirmed', 'cancelled', 'completed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."component_type" AS ENUM('accommodation', 'safari_lodge', 'classic_car', 'support_vehicle', 'vehicle_transfer', 'luggage_transfer', 'helicopter', 'private_aviation', 'guide', 'host', 'dining', 'private_chef', 'activity', 'game_drive', 'conservation', 'conservation_levy', 'welcome', 'farewell', 'amenity', 'logistics', 'free_time', 'custom');--> statement-breakpoint
CREATE TYPE "public"."cost_source" AS ENUM('rate', 'manual', 'none');--> statement-breakpoint
CREATE TYPE "public"."payment_direction" AS ENUM('client_receipt', 'supplier_payment');--> statement-breakpoint
CREATE TYPE "public"."pricing_mode" AS ENUM('margin', 'markup');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'approved', 'issued', 'accepted', 'declined', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."target_metric" AS ENUM('confirmed_value', 'gross_profit', 'bookings');--> statement-breakpoint
CREATE TYPE "public"."allocation_status" AS ENUM('provisional', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."defect_severity" AS ENUM('minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "public"."inspection_kind" AS ENUM('pre_trip', 'return', 'periodic');--> statement-breakpoint
CREATE TYPE "public"."vehicle_category" AS ENUM('classic', 'support', 'luggage', 'guest_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('available', 'maintenance', 'unavailable', 'retired');--> statement-breakpoint
CREATE TYPE "public"."task_category" AS ENUM('guest', 'accommodation', 'transport', 'experiences', 'financial', 'documentation', 'general');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'blocked', 'done');--> statement-breakpoint
CREATE TYPE "public"."inventory_kind" AS ENUM('consumable', 'reusable');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('receive', 'adjust_in', 'adjust_out', 'reserve', 'release', 'issue', 'return', 'write_off', 'lost');--> statement-breakpoint
CREATE TABLE "itinerary_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "component_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"start_time" time,
	"end_time" time,
	"start_location" varchar(200),
	"end_location" varchar(200),
	"operating_brand_id" uuid,
	"guest_facing_brand_id" uuid,
	"provider_company_id" uuid,
	"supplier_id" uuid,
	"supplier_rate_id" uuid,
	"lead_user_id" uuid,
	"booking_status" "booking_status" DEFAULT 'planned' NOT NULL,
	"confirmation_ref" varchar(120),
	"confirmed_on" date,
	"supplier_payment_due" date,
	"guest_description" text,
	"internal_notes" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_source" "cost_source" DEFAULT 'none' NOT NULL,
	"cost_currency" varchar(3),
	"unit_cost" numeric(14, 2),
	"quantity" numeric(10, 2),
	"cost_basis" "rate_basis",
	"minimum_charge" numeric(14, 2),
	"actual_cost" numeric(14, 2),
	"included_in_quote" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "components_cost_ck" CHECK (("itinerary_components"."unit_cost" is null or "itinerary_components"."unit_cost" >= 0) and ("itinerary_components"."quantity" is null or "itinerary_components"."quantity" >= 0) and ("itinerary_components"."actual_cost" is null or "itinerary_components"."actual_cost" >= 0)),
	CONSTRAINT "components_cost_currency_ck" CHECK ("itinerary_components"."unit_cost" is null or "itinerary_components"."cost_currency" is not null)
);
--> statement-breakpoint
CREATE TABLE "itinerary_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"title" varchar(200),
	"location" varchar(200),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_days_day_ck" CHECK ("itinerary_days"."day_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "currency_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_currency" varchar(3) NOT NULL,
	"to_currency" varchar(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" varchar(200) NOT NULL,
	"effective_date" date NOT NULL,
	"is_manual" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_ck" CHECK ("currency_rates"."rate" > 0 and "currency_rates"."from_currency" <> "currency_rates"."to_currency")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"direction" "payment_direction" NOT NULL,
	"supplier_id" uuid,
	"component_id" uuid,
	"quote_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"paid_on" date NOT NULL,
	"method" varchar(60),
	"reference" varchar(120),
	"idempotency_key" varchar(64) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_supplier_ck" CHECK ("payments"."direction" = 'client_receipt' or "payments"."supplier_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"pricing_mode" "pricing_mode" NOT NULL,
	"pricing_percent" numeric(6, 2) NOT NULL,
	"fx_buffer_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total_cost" numeric(14, 2) NOT NULL,
	"total_sell" numeric(14, 2) NOT NULL,
	"gross_profit" numeric(14, 2) NOT NULL,
	"deposit_percent" numeric(5, 2),
	"deposit_due_date" date,
	"balance_due_date" date,
	"valid_until" date,
	"terms" text,
	"inclusions" text,
	"exclusions" text,
	"snapshot" jsonb NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"issued_by_id" uuid,
	"issued_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"client_feedback" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_amounts_ck" CHECK ("quotes"."total_cost" >= 0 and "quotes"."total_sell" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"metric" "target_metric" NOT NULL,
	"brand_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3),
	"note" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "targets_period_ck" CHECK ("targets"."period_end" >= "targets"."period_start" and "targets"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"category" varchar(40) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_budgets_amount_ck" CHECK ("trip_budgets"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vehicle_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"component_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"buffer_days" integer NOT NULL,
	"status" "allocation_status" DEFAULT 'provisional' NOT NULL,
	"pickup_location" varchar(200),
	"return_location" varchar(200),
	"driver_name" varchar(120),
	"mileage_out" integer,
	"mileage_in" integer,
	"fuel_out" varchar(20),
	"fuel_in" varchar(20),
	"handed_over_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alloc_dates_ck" CHECK ("vehicle_allocations"."end_date" >= "vehicle_allocations"."start_date" and "vehicle_allocations"."buffer_days" >= 0),
	CONSTRAINT "alloc_mileage_ck" CHECK ("vehicle_allocations"."mileage_in" is null or "vehicle_allocations"."mileage_out" is null or "vehicle_allocations"."mileage_in" >= "vehicle_allocations"."mileage_out")
);
--> statement-breakpoint
CREATE TABLE "vehicle_defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"inspection_id" uuid,
	"description" text NOT NULL,
	"severity" "defect_severity" NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"resolution" text,
	"reported_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "defects_resolution_ck" CHECK ("vehicle_defects"."resolved_at" is null or "vehicle_defects"."resolution" is not null)
);
--> statement-breakpoint
CREATE TABLE "vehicle_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"allocation_id" uuid,
	"kind" "inspection_kind" NOT NULL,
	"inspector_id" uuid NOT NULL,
	"inspected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checks" jsonb NOT NULL,
	"mileage" integer,
	"fuel" varchar(20),
	"notes" text,
	"signed_off" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration" varchar(20) NOT NULL,
	"make" varchar(60) NOT NULL,
	"model" varchar(60) NOT NULL,
	"variant" varchar(80),
	"year" integer,
	"category" "vehicle_category" NOT NULL,
	"owner_company_id" uuid,
	"supplier_id" uuid,
	"status" "vehicle_status" DEFAULT 'available' NOT NULL,
	"seats" integer,
	"luggage_note" varchar(200),
	"daily_rate" numeric(14, 2),
	"rate_currency" varchar(3),
	"turnaround_days" integer DEFAULT 1 NOT NULL,
	"insurance_expiry" date,
	"licence_expiry" date,
	"current_mileage" integer,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_turnaround_ck" CHECK ("vehicles"."turnaround_days" between 0 and 30)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"trip_id" uuid,
	"component_id" uuid,
	"vehicle_id" uuid,
	"assignee_id" uuid,
	"due_date" date,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"category" "task_category" DEFAULT 'general' NOT NULL,
	"blocked_reason" text,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_done_ck" CHECK (("tasks"."status" = 'done') = ("tasks"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"category" varchar(60) NOT NULL,
	"kind" "inventory_kind" NOT NULL,
	"unit" varchar(20) DEFAULT 'each' NOT NULL,
	"reorder_threshold" integer DEFAULT 0 NOT NULL,
	"unit_cost" numeric(14, 2),
	"currency" varchar(3),
	"location" varchar(120),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_threshold_ck" CHECK ("inventory_items"."reorder_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"trip_id" uuid,
	"type" "movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"note" text,
	"idempotency_key" varchar(64),
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_qty_ck" CHECK ("inventory_movements"."quantity" > 0),
	CONSTRAINT "movements_trip_ck" CHECK ("inventory_movements"."type" not in ('reserve','release','issue','return','lost') or "inventory_movements"."trip_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "itinerary_components" ADD CONSTRAINT "itinerary_components_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_components" ADD CONSTRAINT "itinerary_components_day_id_itinerary_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."itinerary_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_components" ADD CONSTRAINT "itinerary_components_operating_brand_id_brands_id_fk" FOREIGN KEY ("operating_brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_components" ADD CONSTRAINT "itinerary_components_guest_facing_brand_id_brands_id_fk" FOREIGN KEY ("guest_facing_brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_components" ADD CONSTRAINT "itinerary_components_provider_company_id_legal_companies_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."legal_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_components" ADD CONSTRAINT "itinerary_components_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_components" ADD CONSTRAINT "itinerary_components_supplier_rate_id_supplier_rates_id_fk" FOREIGN KEY ("supplier_rate_id") REFERENCES "public"."supplier_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_components" ADD CONSTRAINT "itinerary_components_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_rates" ADD CONSTRAINT "currency_rates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_component_id_itinerary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."itinerary_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_budgets" ADD CONSTRAINT "trip_budgets_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_component_id_itinerary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."itinerary_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_defects" ADD CONSTRAINT "vehicle_defects_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_defects" ADD CONSTRAINT "vehicle_defects_inspection_id_vehicle_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."vehicle_inspections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_defects" ADD CONSTRAINT "vehicle_defects_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_defects" ADD CONSTRAINT "vehicle_defects_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_inspections" ADD CONSTRAINT "vehicle_inspections_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_inspections" ADD CONSTRAINT "vehicle_inspections_allocation_id_vehicle_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."vehicle_allocations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_inspections" ADD CONSTRAINT "vehicle_inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_company_id_legal_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."legal_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_component_id_itinerary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."itinerary_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "components_trip_idx" ON "itinerary_components" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "components_day_idx" ON "itinerary_components" USING btree ("day_id","position");--> statement-breakpoint
CREATE INDEX "components_rate_idx" ON "itinerary_components" USING btree ("supplier_rate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_days_trip_day_uq" ON "itinerary_days" USING btree ("trip_id","day_number");--> statement-breakpoint
CREATE INDEX "fx_pair_idx" ON "currency_rates" USING btree ("from_currency","to_currency","effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idem_uq" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_trip_idx" ON "payments" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_trip_version_uq" ON "quotes" USING btree ("trip_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_one_accepted_uq" ON "quotes" USING btree ("trip_id") WHERE "quotes"."status" = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX "trip_budgets_cat_uq" ON "trip_budgets" USING btree ("trip_id","category");--> statement-breakpoint
CREATE INDEX "alloc_vehicle_idx" ON "vehicle_allocations" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "alloc_trip_idx" ON "vehicle_allocations" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "defects_vehicle_idx" ON "vehicle_defects" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_reg_uq" ON "vehicles" USING btree (upper("registration"));--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "tasks_trip_idx" ON "tasks" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_sku_uq" ON "inventory_items" USING btree (upper("sku"));--> statement-breakpoint
CREATE INDEX "movements_item_idx" ON "inventory_movements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "movements_trip_idx" ON "inventory_movements" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movements_idem_uq" ON "inventory_movements" USING btree ("idempotency_key");