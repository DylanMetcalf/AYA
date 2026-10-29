import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, Car, Compass, Gift, Plane, Plus, Truck, type LucideIcon } from "lucide-react";
import { BookingForm, MoveControls, RatePicker } from "@/components/studio/segment-actions";
import { SegmentForm, emptySegment, type SegmentValues } from "@/components/studio/segment-form";
import { ActionButton } from "@/components/ui/action-button";
import { DayForm } from "@/components/studio/day-form";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, Section } from "@/components/ui/page-header";
import { BOOKING_STATUS_LABEL, COMPONENT_TYPES, type BookingStatus, type ComponentType, type ReadinessCategory } from "@/lib/domain/components";
import { componentCost } from "@/lib/finance/costing";
import { fmt2 } from "@/lib/finance/money";
import { formatMoney } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { loadOr404 } from "@/server/load-or-404";
import { getStudio } from "@/server/services/itinerary";
import { listLegalCompanies } from "@/server/services/org";
import { getTripCosting } from "@/server/services/quotes";
import { listApprovedRates, supplierOptions } from "@/server/services/suppliers";
import { listBrands } from "@/server/services/trips";
import { listAssignableUsers } from "@/server/services/users";
import { addComponentAction, addDayAction, addFirstDayAction, applyRateAction, bookingAction, generateDaysAction, moveComponentAction, removeComponentAction, removeDayAction, updateComponentAction, updateDayAction } from "./actions";

export const metadata: Metadata = { title: "Trip Studio" };

const CATEGORY_ICON: Record<ReadinessCategory, LucideIcon> = { accommodation: BedDouble, transport: Car, experiences: Compass, guest: Gift, logistics: Truck };
const BOOKING_TONE: Record<BookingStatus, Tone> = { planned: "neutral", requested: "info", provisional: "warning", confirmed: "success", completed: "success", cancelled: "danger", unavailable: "danger" };
const weekday = new Intl.DateTimeFormat("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000);

export default async function StudioPage({ params }: PageProps<"/trips/[id]/studio">) {
  const actor = await requireActor();
  const { id } = await params;
  const { trip, days, components, showCosts } = await loadOr404(getStudio(db, actor, id));
  const editable = can(actor, "trip.edit") && !["closed", "cancelled", "lost"].includes(trip.status) && !trip.archivedAt;
  const [brands, companies, suppliers, users, rates, costing] = await Promise.all([
    listBrands(db), listLegalCompanies(db), supplierOptions(db), listAssignableUsers(db),
    showCosts ? listApprovedRates(db) : Promise.resolve([]),
    showCosts ? getTripCosting(db, actor, id).then((r) => r.costing) : Promise.resolve(null),
  ]);
  const opts = {
    brands: brands.map((b) => ({ value: b.id, label: b.name })),
    companies: companies.map((c) => ({ value: c.id, label: c.name })),
    suppliers: suppliers.map((s) => ({ value: s.id, label: s.name })),
    users: users.map((u) => ({ value: u.id, label: u.name })),
  };
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const dayLabel = (n: number) => `Day ${n}${trip.startDate ? ` · ${weekday.format(addDays(trip.startDate, n - 1))}` : ""}`;
  const dayOptions = days.map((d) => ({ id: d.id, label: dayLabel(d.dayNumber) }));
  const s = (x: string | null | undefined) => x ?? "";
  const toValues = (c: (typeof components)[number]): SegmentValues => ({
    type: c.type as ComponentType, title: c.title, startTime: s(c.startTime).slice(0, 5), endTime: s(c.endTime).slice(0, 5), startLocation: s(c.startLocation), endLocation: s(c.endLocation),
    operatingBrandId: s(c.operatingBrandId), guestFacingBrandId: s(c.guestFacingBrandId), providerCompanyId: s(c.providerCompanyId), supplierId: s(c.supplierId), leadUserId: s(c.leadUserId),
    guestDescription: s(c.guestDescription), internalNotes: s(c.internalNotes), details: c.details ?? {}, includedInQuote: c.includedInQuote, costCurrency: c.costCurrency ?? trip.currency,
    unitCost: s(c.unitCost), quantity: s(c.quantity) || "1", costBasis: s(c.costBasis), minimumCharge: s(c.minimumCharge), actualCost: s(c.actualCost), supplierPaymentDue: s(c.supplierPaymentDue),
  });
  const bookingCounts = components.reduce<Record<string, number>>((a, c) => ((a[c.bookingStatus] = (a[c.bookingStatus] ?? 0) + 1), a), {});
  // Brand transitions: consecutive segments grouped by the brand the guest experiences.
  const journeyBrands: { name: string; color: string; from: number; to: number }[] = [];
  for (const d of days) for (const c of components.filter((x) => x.dayId === d.id)) {
    const b = brandById.get(c.guestFacingBrandId ?? trip.guestFacingBrandId);
    if (!b) continue;
    const last = journeyBrands.at(-1);
    if (last && last.name === b.name) last.to = d.dayNumber;
    else journeyBrands.push({ name: b.name, color: b.colorAccent, from: d.dayNumber, to: d.dayNumber });
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
      <div>
        {days.length === 0 ? (
          <EmptyState title="Start the itinerary" action={editable && (
            <div className="flex flex-wrap justify-center gap-2">
              {trip.startDate && trip.endDate && <ActionButton action={generateDaysAction.bind(null, id)} variant="primary" size="md">Create days from travel dates</ActionButton>}
              <ActionButton action={addFirstDayAction.bind(null, id)} size="md">Add a single day</ActionButton>
            </div>
          )}>
            Build the journey day by day: accommodation, classic car drives, helicopter transfers, guides, dining and safari experiences.
          </EmptyState>
        ) : (
          <ol className="space-y-5">
            {days.map((d) => {
              const segs = components.filter((c) => c.dayId === d.id);
              return (
                <li key={d.id}>
                  <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                      <div className="flex items-baseline gap-3">
                        <span className="rounded-[var(--radius-sm)] bg-graphite px-2 py-0.5 text-[11.5px] font-medium text-surface tabular">{dayLabel(d.dayNumber)}</span>
                        <span className="text-[14px] font-medium">{d.title ?? <span className="text-ink-faint">Untitled day</span>}</span>
                        {d.location && <span className="text-[12.5px] text-ink-faint">{d.location}</span>}
                      </div>
                      {editable && (
                        <div className="flex items-center gap-1">
                          <Drawer trigger={{ label: "Edit day", variant: "ghost" }} title={`Edit ${dayLabel(d.dayNumber)}`}>
                            (
                              <DayForm action={updateDayAction.bind(null, id, d.id)} v={{ title: s(d.title), location: s(d.location), notes: s(d.notes) }} submitLabel="Save day" />
                            )
                          </Drawer>
                          {segs.length === 0 && <ConfirmButton variant="ghost" label="Remove" title={`Remove ${dayLabel(d.dayNumber)}?`} body="Following days are renumbered." confirmLabel="Remove day" danger action={removeDayAction.bind(null, id, d.id)} />}
                        </div>
                      )}
                    </div>
                    {segs.length === 0 ? (
                      <p className="px-5 py-4 text-[13px] text-ink-faint">No segments yet.</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {segs.map((c, i) => {
                          const def = COMPONENT_TYPES[c.type as ComponentType];
                          const Icon = CATEGORY_ICON[def.category];
                          const cost = showCosts ? componentCost({ unitCost: c.unitCost, quantity: c.quantity, minimumCharge: c.minimumCharge, basis: c.costBasis, currency: c.costCurrency }) : null;
                          const opBrand = brandById.get(c.operatingBrandId ?? trip.primaryBrandId);
                          const gfBrand = c.guestFacingBrandId ? brandById.get(c.guestFacingBrandId) : null;
                          return (
                            <li key={c.id} className="group px-5 py-4">
                              <div className="flex items-start gap-4">
                                <div className="w-12 shrink-0 pt-0.5 text-[12px] text-ink-faint tabular">{c.startTime ? c.startTime.slice(0, 5) : "—"}</div>
                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-text" aria-hidden>{c.type === "helicopter" || c.type === "private_aviation" ? <Plane size={14} /> : <Icon size={14} />}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <p className="text-[14px] font-medium">{c.title}</p>
                                    <span className="text-[12px] text-ink-faint">{def.label}</span>
                                    <Badge tone={BOOKING_TONE[c.bookingStatus as BookingStatus]}>{BOOKING_STATUS_LABEL[c.bookingStatus as BookingStatus]}{c.confirmationRef ? ` · ${c.confirmationRef}` : ""}</Badge>
                                    {def.critical && !["confirmed", "completed"].includes(c.bookingStatus) && <span className="text-[11.5px] text-warning">Critical</span>}
                                    {!c.includedInQuote && <Badge>Not in quote</Badge>}
                                  </div>
                                  <p className="mt-1 text-[12.5px] text-ink-muted">
                                    {[c.startLocation && c.endLocation ? `${c.startLocation} → ${c.endLocation}` : c.startLocation, c.supplierName, Object.values(c.details ?? {}).slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || <span className="text-ink-faint">No supplier or location yet</span>}
                                  </p>
                                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-faint">
                                    {opBrand && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: opBrand.colorAccent }} aria-hidden />Operated by {opBrand.name}</span>}
                                    {gfBrand && <span>· Guest sees {gfBrand.name}</span>}
                                    {c.leadName && <span>· Lead {c.leadName}</span>}
                                  </p>
                                  {c.guestDescription && <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-muted italic">{c.guestDescription}</p>}
                                </div>
                                {showCosts && (
                                  <div className="w-40 shrink-0 text-right">
                                    {cost ? (
                                      <>
                                        <p className="text-[13.5px] font-medium tabular">{formatMoney(fmt2(cost.amount), c.costCurrency!)}</p>
                                        <p className="text-[11px] text-ink-faint">{c.costSource === "rate" ? `Rate v${c.rateVersion}${c.rateStatus !== "approved" ? ` (${c.rateStatus})` : ""}` : "Manual cost"}</p>
                                      </>
                                    ) : <p className="text-[12px] text-warning">{c.includedInQuote ? "No cost yet" : "—"}</p>}
                                  </div>
                                )}
                              </div>
                              {cost && <p className="mt-1.5 pl-[92px] text-[11.5px] text-ink-faint tabular">{cost.explanation}</p>}
                              {editable && (
                                <div className="mt-3 flex flex-wrap items-center gap-1 pl-[92px]">
                                  <MoveControls isFirst={i === 0} isLast={i === segs.length - 1} days={dayOptions} currentDayId={d.id} title={c.title} move={moveComponentAction.bind(null, id, c.id)} />
                                  <span className="mx-1 h-4 w-px bg-line" aria-hidden />
                                  <Drawer trigger={{ label: "Edit", variant: "ghost" }} title={`Edit “${c.title}”`} wide>
                                    <SegmentForm action={updateComponentAction.bind(null, id, c.id)} v={toValues(c)} {...opts} showCosts={showCosts} submitLabel="Save segment" costSourceNote={c.costSource === "rate" ? `Priced from approved rate “${c.rateName}” v${c.rateVersion}. Editing cost fields detaches it from the rate.` : undefined} />
                                  </Drawer>
                                  <Drawer trigger={{ label: "Supplier arrangement", variant: "ghost" }} title="Supplier arrangement" description={c.title}>
                                    <BookingForm action={bookingAction.bind(null, id, c.id)} current={{ status: c.bookingStatus, confirmationRef: c.confirmationRef }} />
                                  </Drawer>
                                  {showCosts && (
                                    <Drawer trigger={{ label: "Price from rate", variant: "ghost" }} title="Price from an approved rate" description={`${c.title} — quantity defaults from the rate basis and party size.`} wide>
                                      <RatePicker rates={rates} componentType={c.type} apply={applyRateAction.bind(null, id, c.id)} />
                                    </Drawer>
                                  )}
                                  <ConfirmButton variant="ghost" label="Remove" title={`Remove “${c.title}”?`} body="Segments with an active supplier arrangement or vehicle allocation must be cancelled first." confirmLabel="Remove" danger action={removeComponentAction.bind(null, id, c.id)} />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {editable && (
                      <div className="border-t border-line px-5 py-3">
                        <Drawer trigger={{ label: <><Plus size={14} aria-hidden /> Add segment</>, variant: "ghost" }} title={`Add segment to ${dayLabel(d.dayNumber)}`} wide>
                          <SegmentForm action={addComponentAction.bind(null, id, d.id)} v={{ ...emptySegment(), costCurrency: trip.currency }} {...opts} showCosts={showCosts} submitLabel="Add segment" />
                        </Drawer>
                      </div>
                    )}
                  </Panel>
                </li>
              );
            })}
          </ol>
        )}
        {editable && days.length > 0 && (
          <div className="mt-5">
            <Drawer trigger={{ label: <><Plus size={14} aria-hidden /> Add day {days.length + 1}</> }} title={`Add day ${days.length + 1}`}>
              (
                <DayForm action={addDayAction.bind(null, id)} submitLabel="Add day" />
              )
            </Drawer>
          </div>
        )}
      </div>

      <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
        {costing && (
          <Section title="Live costing" description={`Supplier costs in ${trip.currency}, at today's recorded exchange rates. Not a quote.`}>
            <Panel className="p-5">
              <p className="text-[11.5px] text-ink-faint">Estimated cost</p>
              <p className="title text-[24px] tabular">{formatMoney(fmt2(costing.totalCost), trip.currency)}</p>
              {costing.issues.length > 0 && <Alert tone="warning" className="mt-3">{costing.issues.length} segment(s) need a cost or an exchange rate before a quote can be generated.</Alert>}
              <dl className="mt-4 space-y-1.5 text-[12.5px]">
                {Object.entries(costing.byCategory).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-ink-muted capitalize">{k}</dt><dd className="tabular">{formatMoney(fmt2(v), trip.currency)}</dd></div>)}
              </dl>
              {Object.keys(costing.byOperatingBrand).length > 1 && (
                <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[12.5px]">
                  <p className="text-[11.5px] text-ink-faint">Cost by operating brand</p>
                  {Object.entries(costing.byOperatingBrand).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-ink-muted">{k}</dt><dd className="tabular">{formatMoney(fmt2(v), trip.currency)}</dd></div>)}
                </dl>
              )}
              <Link href={`/trips/${id}/commercial`} className="mt-4 inline-block text-[12.5px] text-accent-text hover:underline">Price and generate quote →</Link>
            </Panel>
          </Section>
        )}
        {journeyBrands.length > 0 && (
          <Section title="Guest's journey by brand" description="How the guest experiences brand transitions.">
            <Panel className="p-5">
              <ol className="space-y-2.5">
                {journeyBrands.map((b, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                    <span className="font-medium">{b.name}</span>
                    <span className="text-ink-faint tabular">{b.from === b.to ? `Day ${b.from}` : `Days ${b.from}–${b.to}`}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          </Section>
        )}
        <Section title="Supplier arrangements">
          <Panel className="p-5">
            {components.length === 0 ? <p className="text-[13px] text-ink-muted">No segments yet.</p> : (
              <dl className="space-y-1.5 text-[12.5px]">
                {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).filter((k) => bookingCounts[k]).map((k) => (
                  <div key={k} className="flex items-center justify-between"><dt><Badge tone={BOOKING_TONE[k]}>{BOOKING_STATUS_LABEL[k]}</Badge></dt><dd className="tabular">{bookingCounts[k]}</dd></div>
                ))}
              </dl>
            )}
          </Panel>
        </Section>
      </aside>
    </div>
  );
}
