import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { validateSession } from "@/server/auth/session";
import { auditEvents, users } from "@/server/db/schema";
import { activateInvitation, inviteUser, login, setUserActive } from "@/server/services/users";
import { db, makeActor } from "./helpers";

describe("invitation, login and sessions", () => {
  it("invites, activates once, signs in, and rejects reuse of the invitation", async () => {
    const admin = await makeActor("owner");
    const { token } = await inviteUser(db, admin, { email: "Guide@Example.com", name: "Thandi", roleKeys: ["guide"] });
    await expect(login(db, { email: "guide@example.com", password: "a-long-password-123" })).rejects.toThrow(/incorrect/);
    await activateInvitation(db, token, "a-long-password-123");
    await expect(activateInvitation(db, token, "another-password-456")).rejects.toThrow(/invalid or has expired/);
    const s = await login(db, { email: "GUIDE@example.com", password: "a-long-password-123" });
    const v = await validateSession(db, s.token);
    expect(v?.actor.roleKeys).toEqual(["guide"]);
    expect(v?.actor.permissions.has("trip.read_all")).toBe(false);
  });

  it("rejects short passwords and duplicate emails", async () => {
    const admin = await makeActor("owner");
    const { token } = await inviteUser(db, admin, { email: "a@example.com", name: "A", roleKeys: ["finance"] });
    await expect(activateInvitation(db, token, "short")).rejects.toThrow(/at least 12/);
    await expect(inviteUser(db, admin, { email: "A@EXAMPLE.com", name: "A2", roleKeys: ["finance"] })).rejects.toThrow(/already exists/);
  });

  it("only admins can invite", async () => {
    const mgr = await makeActor("management");
    await expect(inviteUser(db, mgr, { email: "x@example.com", name: "X", roleKeys: ["owner"] })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("deactivation revokes existing sessions immediately and blocks login", async () => {
    const admin = await makeActor("owner");
    const { token, userId } = await inviteUser(db, admin, { email: "b@example.com", name: "B", roleKeys: ["trip_manager"] });
    await activateInvitation(db, token, "a-long-password-123");
    const s = await login(db, { email: "b@example.com", password: "a-long-password-123" });
    await setUserActive(db, admin, userId, false);
    expect(await validateSession(db, s.token)).toBeNull();
    await expect(login(db, { email: "b@example.com", password: "a-long-password-123" })).rejects.toThrow(/incorrect/);
    await expect(setUserActive(db, admin, admin.id, false)).rejects.toThrow(/your own/);
  });

  it("records security audit events without secrets", async () => {
    const admin = await makeActor("owner");
    await inviteUser(db, admin, { email: "c@example.com", name: "C", roleKeys: ["finance"] });
    const events = await db.select().from(auditEvents).where(eq(auditEvents.action, "user.invited"));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toMatch(/token/i);
    const [u] = await db.select().from(users).where(eq(users.email, "c@example.com"));
    expect(u!.passwordHash).toBeNull();
  });
});
