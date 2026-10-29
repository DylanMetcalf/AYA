import { boolean, index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

export const clientOrganisations = pgTable("client_organisations", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  kind: varchar("kind", { length: 30 }).notNull().default("company"), // company | travel_partner | family_office
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 50 }),
  country: varchar("country", { length: 2 }),
  notes: text("notes"),
  ...timestamps,
});

/**
 * Guests and lead contacts. `dietary`, `accessibility` and `medicalNotes` are sensitive and are only
 * returned to holders of `guest.read_sensitive` (enforced in the guest service).
 */
export const guests = pgTable(
  "guests",
  {
    id: id(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 50 }),
    nationality: varchar("nationality", { length: 2 }),
    clientOrganisationId: uuid("client_organisation_id").references(() => clientOrganisations.id, {
      onDelete: "set null",
    }),
    preferences: text("preferences"),
    dietary: text("dietary"),
    accessibility: text("accessibility"),
    medicalNotes: text("medical_notes"),
    relationshipNotes: text("relationship_notes"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("guests_name_idx").on(t.lastName, t.firstName)],
);
