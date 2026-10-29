import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";


/** How a legal company relates to the ULTIMA group. Configurable; not an ownership claim. */
export const companyGroupRole = pgEnum("company_group_role", [
  "central_operator",
  "group_company",
  "connected_partner",
  "supplier",
  "other",
]);

export const legalCompanies = pgTable("legal_companies", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  registrationNumber: varchar("registration_number", { length: 100 }),
  vatNumber: varchar("vat_number", { length: 100 }),
  country: varchar("country", { length: 2 }).notNull().default("ZA"),
  address: text("address"),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("ZAR"),
  groupRole: companyGroupRole("group_role").notNull().default("other"),
  /** False until the business confirms legal/tax details (OPEN_DECISIONS D1). */
  verified: boolean("verified").notNull().default(false),
  notes: text("notes"),
  ...timestamps,
});

/** operating = runs journeys; trading = guest-facing name; partner = connected business brand. */
export const brandKind = pgEnum("brand_kind", ["operating", "trading", "partner"]);

export const brands = pgTable(
  "brands",
  {
    id: id(),
    slug: varchar("slug", { length: 50 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    kind: brandKind("kind").notNull(),
    legalCompanyId: uuid("legal_company_id").references(() => legalCompanies.id, { onDelete: "restrict" }),
    tagline: varchar("tagline", { length: 200 }),
    description: text("description"),
    colorPrimary: varchar("color_primary", { length: 7 }).notNull(),
    colorSecondary: varchar("color_secondary", { length: 7 }).notNull(),
    colorAccent: varchar("color_accent", { length: 7 }).notNull(),
    contactEmail: varchar("contact_email", { length: 200 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    website: varchar("website", { length: 200 }),
    documentFooter: text("document_footer"),
    /** True while the identity is a placeholder awaiting official brand guidelines. */
    isProvisional: boolean("is_provisional").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("brands_slug_uq").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 254 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    passwordHash: text("password_hash"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const roles = pgTable(
  "roles",
  {
    id: id(),
    key: varchar("key", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_key_uq").on(t.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 80 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invitations_token_uq").on(t.tokenHash)],
);

/** Business + security audit trail. Never store secrets, tokens or card data here. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    category: varchar("category", { length: 20 }).notNull().default("business"),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }).notNull(),
    summary: text("summary").notNull(),
    changes: jsonb("changes"),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_at_idx").on(t.at)],
);
