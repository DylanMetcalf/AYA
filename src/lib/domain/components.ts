/**
 * Itinerary component catalogue. Each type declares its readiness category, whether an unconfirmed
 * booking is critical to the journey, and the default rate basis offered when costing it.
 */
export type ReadinessCategory = "accommodation" | "transport" | "experiences" | "guest" | "logistics";
export const RATE_BASES = [
  "per_person", "per_person_sharing", "per_room_per_night", "per_room_per_stay", "per_vehicle_per_day",
  "per_vehicle_per_km", "per_transfer", "per_flight", "per_hour", "per_guide_per_day", "per_activity",
  "per_group", "per_item", "fixed",
] as const;
export type RateBasis = (typeof RATE_BASES)[number];

interface ComponentTypeDef {
  label: string;
  category: ReadinessCategory;
  /** An unconfirmed booking of this type blocks "ready to travel". */
  critical: boolean;
  basis: RateBasis;
  /** Type-specific detail fields, rendered as labelled inputs and stored in `details`. */
  fields: { key: string; label: string; kind?: "text" | "number" }[];
}

export const COMPONENT_TYPES = {
  accommodation: { label: "Accommodation", category: "accommodation", critical: true, basis: "per_room_per_night", fields: [{ key: "roomType", label: "Room type" }, { key: "nights", label: "Nights", kind: "number" }, { key: "boardBasis", label: "Board basis" }] },
  safari_lodge: { label: "Safari lodge", category: "accommodation", critical: true, basis: "per_person_sharing", fields: [{ key: "roomType", label: "Suite / room" }, { key: "nights", label: "Nights", kind: "number" }, { key: "reserve", label: "Reserve" }] },
  classic_car: { label: "Classic car", category: "transport", critical: true, basis: "per_vehicle_per_day", fields: [{ key: "vehicleRequested", label: "Vehicle requested" }, { key: "collection", label: "Collection point" }, { key: "return", label: "Return point" }] },
  support_vehicle: { label: "Support vehicle", category: "transport", critical: true, basis: "per_vehicle_per_day", fields: [{ key: "driver", label: "Driver" }, { key: "purpose", label: "Purpose" }] },
  vehicle_transfer: { label: "Road transfer", category: "transport", critical: true, basis: "per_transfer", fields: [{ key: "pickup", label: "Pick-up" }, { key: "dropoff", label: "Drop-off" }] },
  luggage_transfer: { label: "Luggage transfer", category: "logistics", critical: true, basis: "per_transfer", fields: [{ key: "pieces", label: "Pieces", kind: "number" }] },
  helicopter: { label: "Helicopter transfer", category: "transport", critical: true, basis: "per_flight", fields: [{ key: "aircraft", label: "Aircraft" }, { key: "luggageLimitKg", label: "Luggage limit (kg)", kind: "number" }, { key: "landingSite", label: "Landing site" }] },
  private_aviation: { label: "Private aviation", category: "transport", critical: true, basis: "per_flight", fields: [{ key: "aircraft", label: "Aircraft" }, { key: "route", label: "Route" }] },
  guide: { label: "Private guide", category: "experiences", critical: true, basis: "per_guide_per_day", fields: [{ key: "languages", label: "Languages" }] },
  host: { label: "Host", category: "experiences", critical: false, basis: "per_guide_per_day", fields: [] },
  dining: { label: "Dining", category: "experiences", critical: false, basis: "per_person", fields: [{ key: "venue", label: "Venue" }, { key: "dietaryNotes", label: "Dietary notes" }] },
  private_chef: { label: "Private chef", category: "experiences", critical: false, basis: "per_group", fields: [] },
  activity: { label: "Activity", category: "experiences", critical: false, basis: "per_person", fields: [{ key: "duration", label: "Duration" }] },
  game_drive: { label: "Game drive", category: "experiences", critical: false, basis: "per_person", fields: [{ key: "vehicle", label: "Vehicle" }] },
  conservation: { label: "Conservation experience", category: "experiences", critical: false, basis: "per_person", fields: [{ key: "organisation", label: "Organisation" }] },
  conservation_levy: { label: "Conservation levy", category: "experiences", critical: false, basis: "per_person", fields: [] },
  welcome: { label: "Welcome experience", category: "guest", critical: false, basis: "fixed", fields: [] },
  farewell: { label: "Farewell experience", category: "guest", critical: false, basis: "fixed", fields: [] },
  amenity: { label: "Guest amenity / gift", category: "guest", critical: false, basis: "per_item", fields: [{ key: "items", label: "Items" }] },
  logistics: { label: "Internal logistics", category: "logistics", critical: false, basis: "fixed", fields: [] },
  free_time: { label: "Free time", category: "guest", critical: false, basis: "fixed", fields: [] },
  custom: { label: "Custom service", category: "experiences", critical: false, basis: "fixed", fields: [] },
} satisfies Record<string, ComponentTypeDef>;

export type ComponentType = keyof typeof COMPONENT_TYPES;
export const COMPONENT_TYPE_KEYS = Object.keys(COMPONENT_TYPES) as ComponentType[];

/** Supplier arrangement status. Adding a component never implies it is booked. */
export const BOOKING_STATUSES = ["planned", "requested", "provisional", "confirmed", "cancelled", "completed", "unavailable"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  planned: "Planned — not requested",
  requested: "Requested",
  provisional: "Provisionally held",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  unavailable: "Unavailable",
};

export const RATE_BASIS_LABEL: Record<RateBasis, string> = {
  per_person: "Per person",
  per_person_sharing: "Per person sharing, per night",
  per_room_per_night: "Per room, per night",
  per_room_per_stay: "Per room, per stay",
  per_vehicle_per_day: "Per vehicle, per day",
  per_vehicle_per_km: "Per vehicle, per km",
  per_transfer: "Per transfer",
  per_flight: "Per flight",
  per_hour: "Per hour",
  per_guide_per_day: "Per guide, per day",
  per_activity: "Per activity",
  per_group: "Per group",
  per_item: "Per item",
  fixed: "Fixed price",
};
