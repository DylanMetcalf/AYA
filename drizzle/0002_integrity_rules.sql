-- Integrity rules that the ORM schema cannot express. Additive; safe on existing data.

-- 1. Vehicles cannot be double-booked: non-cancelled allocations of the same vehicle may not overlap,
--    including the turnaround buffer after each allocation. Enforced by the database, so two
--    concurrent requests cannot both succeed.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "vehicle_allocations" ADD CONSTRAINT "vehicle_allocations_no_overlap"
  EXCLUDE USING gist (
    "vehicle_id" WITH =,
    daterange("start_date", "end_date" + "buffer_days" + 1, '[)') WITH &&
  ) WHERE ("status" <> 'cancelled');--> statement-breakpoint

-- 2. Issued quotes are immutable: once a quote leaves 'draft', its commercial content cannot change.
--    Only status progression and decision metadata may be updated, and quotes past draft cannot be deleted.
CREATE OR REPLACE FUNCTION quotes_protect_issued() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Quote % v% is %, and cannot be deleted', OLD.trip_id, OLD.version, OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.total_cost IS DISTINCT FROM OLD.total_cost
    OR NEW.total_sell IS DISTINCT FROM OLD.total_sell
    OR NEW.gross_profit IS DISTINCT FROM OLD.gross_profit
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.pricing_mode IS DISTINCT FROM OLD.pricing_mode
    OR NEW.pricing_percent IS DISTINCT FROM OLD.pricing_percent
    OR NEW.fx_buffer_percent IS DISTINCT FROM OLD.fx_buffer_percent
    OR NEW.terms IS DISTINCT FROM OLD.terms
    OR NEW.inclusions IS DISTINCT FROM OLD.inclusions
    OR NEW.exclusions IS DISTINCT FROM OLD.exclusions
    OR NEW.deposit_percent IS DISTINCT FROM OLD.deposit_percent
    OR NEW.deposit_due_date IS DISTINCT FROM OLD.deposit_due_date
    OR NEW.balance_due_date IS DISTINCT FROM OLD.balance_due_date
    OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    OR NEW.trip_id IS DISTINCT FROM OLD.trip_id
    OR NEW.version IS DISTINCT FROM OLD.version
  ) THEN
    RAISE EXCEPTION 'Quote v% is %; its commercial content is locked. Create a revised version instead.', OLD.version, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  -- Terminal states cannot be reopened.
  IF OLD.status IN ('declined', 'expired', 'superseded') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Quote v% is % and cannot change status', OLD.version, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER quotes_protect_issued_trg BEFORE UPDATE OR DELETE ON "quotes"
  FOR EACH ROW EXECUTE FUNCTION quotes_protect_issued();--> statement-breakpoint

-- 3. Approved supplier rates are never edited in place; a change creates a new version.
CREATE OR REPLACE FUNCTION supplier_rates_protect_approved() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('approved', 'superseded') AND (
       NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.basis IS DISTINCT FROM OLD.basis OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
    OR NEW.valid_to IS DISTINCT FROM OLD.valid_to OR NEW.minimum_charge IS DISTINCT FROM OLD.minimum_charge
    OR NEW.service_id IS DISTINCT FROM OLD.service_id OR NEW.lineage_id IS DISTINCT FROM OLD.lineage_id
  ) THEN
    RAISE EXCEPTION 'Approved rate versions are read-only; record a new version instead.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER supplier_rates_protect_trg BEFORE UPDATE ON "supplier_rates"
  FOR EACH ROW EXECUTE FUNCTION supplier_rates_protect_approved();--> statement-breakpoint
-- At most one approved version per rate line at a time.
CREATE UNIQUE INDEX "supplier_rates_one_approved_uq" ON "supplier_rates" ("lineage_id") WHERE "status" = 'approved';--> statement-breakpoint

-- 4. Grant permissions introduced in this release to existing system roles (custom roles untouched).
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r.id, p.permission
FROM "roles" r
JOIN (VALUES
  ('owner', 'fleet.safety_override'), ('owner', 'inventory.read'), ('owner', 'inventory.edit'),
  ('management', 'fleet.safety_override'), ('management', 'inventory.read'), ('management', 'inventory.edit'),
  ('trip_manager', 'inventory.read'),
  ('operations', 'inventory.read'), ('operations', 'inventory.edit'),
  ('fleet', 'inventory.read')
) AS p(role_key, permission) ON p.role_key = r.key
WHERE r.is_system
ON CONFLICT DO NOTHING;
