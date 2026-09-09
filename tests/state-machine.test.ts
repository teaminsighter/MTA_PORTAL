import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { audit_log, leads } from "@/db/schema";
import type { LeadState } from "@/lib/mock";
import { canTransition, TRANSITIONS } from "@/lib/leads/state";

/*
 * State machine — Phase 4 sub-4:
 *   canTransition matches the §9 diagram
 *   transitionLead is race-safe (version + state guard)
 *   audit_log gets a lead.state_transition row per hop
 *   autoAdvanceIfReady walks received → enriching → ready_for_review
 *     iff there's a CV and at least one picked agent
 *   autoAdvanceIfReady is a no-op otherwise (missing cv, no picks,
 *     wrong starting state, or concurrent write)
 */

let testDb: TestDb;

vi.mock("@/db/client", () => ({ getDb: () => testDb }));
vi.mock("@/lib/auth", () => ({
  auth: async () => null,
  handlers: {},
  signIn: async () => {},
  signOut: async () => {},
}));

const { transitionLead } = await import("@/lib/leads/state");
const { autoAdvanceIfReady } = await import("@/lib/leads/auto-advance");

const LEAD_ROW = "lead_1";
const LEAD_PUBLIC = "MTA-2026-90001";
// State-machine correctness doesn't depend on an actor id; pass null so
// audit_log's actor_user_id FK is satisfied without a users fixture.
const ACTOR = null;

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

beforeEach(() => {
  testDb = createTestDb();
});

// The DB schema's state enum doesn't include `empty_workspace`, so
// narrow accordingly.
type DbLeadState = Exclude<LeadState, "empty_workspace">;

function insertLead(state: DbLeadState = "received") {
  testDb
    .insert(leads)
    .values({
      id: LEAD_ROW,
      d1_lead_id: LEAD_PUBLIC,
      address_raw: "1 Test",
      address_normalised: "1 test",
      vendor_name: "V",
      phone: "",
      email: "",
      source: "web",
      state,
      version: 1,
      created_at: "2026-09-06T00:00:00.000Z",
      updated_at: "2026-09-06T00:00:00.000Z",
    })
    .run();
}

async function getLead() {
  const [row] = await testDb
    .select()
    .from(leads)
    .where(eq(leads.id, LEAD_ROW));
  return row;
}

/* -------------------- pure state machine -------------------- */

describe("canTransition", () => {
  it("matches PLAN §9 for the forward flow", () => {
    expect(canTransition("received", "enriching")).toBe(true);
    expect(canTransition("enriching", "ready_for_review")).toBe(true);
    expect(canTransition("ready_for_review", "dispatching")).toBe(true);
    expect(canTransition("dispatching", "sent")).toBe(true);
    expect(canTransition("dispatching", "partial_send")).toBe(true);
    expect(canTransition("sent", "awaiting_agent_responses")).toBe(true);
    expect(canTransition("awaiting_agent_responses", "agent_appointed")).toBe(
      true
    );
    expect(canTransition("agent_appointed", "listed")).toBe(true);
    expect(canTransition("listed", "sold")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("received", "ready_for_review")).toBe(false);
    expect(canTransition("received", "sold")).toBe(false);
    expect(canTransition("sent", "received")).toBe(false);
    expect(canTransition("sold", "listed")).toBe(false);
  });

  it("terminal states have no outgoing transitions", () => {
    expect(TRANSITIONS.sold).toEqual([]);
    expect(TRANSITIONS.empty_workspace).toEqual([]);
  });
});

/* -------------------- transitionLead -------------------- */

describe("transitionLead", () => {
  it("moves state + bumps version + audits", async () => {
    insertLead("received");
    const res = await transitionLead({
      leadRowId: LEAD_ROW,
      from: "received",
      to: "enriching",
      expectedVersion: 1,
      actorUserId: ACTOR,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state).toBe("enriching");
      expect(res.version).toBe(2);
    }
    const row = await getLead();
    expect(row.state).toBe("enriching");
    expect(row.version).toBe(2);

    const audits = await testDb.select().from(audit_log);
    const hop = audits.find((a) => a.action === "lead.state_transition");
    expect(hop).toBeDefined();
    expect(hop?.lead_id).toBe(LEAD_ROW);
  });

  it("refuses an illegal transition", async () => {
    insertLead("received");
    const res = await transitionLead({
      leadRowId: LEAD_ROW,
      from: "received",
      to: "sold",
      expectedVersion: 1,
      actorUserId: ACTOR,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("not_allowed");
    const row = await getLead();
    expect(row.state).toBe("received");
    expect(row.version).toBe(1);
  });

  it("returns version_conflict on a stale version", async () => {
    insertLead("received");
    // Concurrent write.
    await testDb
      .update(leads)
      .set({ version: 5 })
      .where(eq(leads.id, LEAD_ROW))
      .run();
    const res = await transitionLead({
      leadRowId: LEAD_ROW,
      from: "received",
      to: "enriching",
      expectedVersion: 1,
      actorUserId: ACTOR,
    });
    expect(res.ok).toBe(false);
    if (!res.ok && res.code === "version_conflict") {
      expect(res.latest.version).toBe(5);
      expect(res.latest.state).toBe("received");
    } else {
      throw new Error(`expected version_conflict, got ${JSON.stringify(res)}`);
    }
  });
});

/* -------------------- autoAdvanceIfReady -------------------- */

describe("autoAdvanceIfReady", () => {
  it("received + CV + pick → ready_for_review (two audit rows)", async () => {
    insertLead("received");
    const res = await autoAdvanceIfReady({
      leadRowId: LEAD_ROW,
      currentState: "received",
      currentVersion: 1,
      hasCv: true,
      hasPickedAgent: true,
      actorUserId: ACTOR,
    });
    expect(res.advanced).toBe(true);
    expect(res.finalState).toBe("ready_for_review");

    const row = await getLead();
    expect(row.state).toBe("ready_for_review");
    expect(row.version).toBe(3); // 1 → 2 (enriching) → 3 (ready_for_review)

    const audits = await testDb
      .select()
      .from(audit_log)
      .where(eq(audit_log.action, "lead.state_transition"));
    expect(audits).toHaveLength(2);
  });

  it("no-op when the lead isn't in received", async () => {
    insertLead("ready_for_review");
    const res = await autoAdvanceIfReady({
      leadRowId: LEAD_ROW,
      currentState: "ready_for_review",
      currentVersion: 1,
      hasCv: true,
      hasPickedAgent: true,
      actorUserId: ACTOR,
    });
    expect(res.advanced).toBe(false);
    expect(res.finalState).toBe("ready_for_review");
    const audits = await testDb.select().from(audit_log);
    expect(audits).toHaveLength(0);
  });

  it("no-op when there's no CV", async () => {
    insertLead("received");
    const res = await autoAdvanceIfReady({
      leadRowId: LEAD_ROW,
      currentState: "received",
      currentVersion: 1,
      hasCv: false,
      hasPickedAgent: true,
      actorUserId: ACTOR,
    });
    expect(res.advanced).toBe(false);
    const row = await getLead();
    expect(row.state).toBe("received");
    expect(row.version).toBe(1);
  });

  it("no-op when there are no picked agents", async () => {
    insertLead("received");
    const res = await autoAdvanceIfReady({
      leadRowId: LEAD_ROW,
      currentState: "received",
      currentVersion: 1,
      hasCv: true,
      hasPickedAgent: false,
      actorUserId: ACTOR,
    });
    expect(res.advanced).toBe(false);
    const row = await getLead();
    expect(row.state).toBe("received");
  });
});
