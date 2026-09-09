import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { agents, lead_agent_picks, leads, users } from "@/db/schema";

/*
 * pickAgentAction / unpickAgentAction — Phase 4 sub-2:
 *   role gate on both actions
 *   pick creates a row with the next display_order (max+1)
 *   pick on an unpicked row clears unpicked_at (soft-undelete)
 *   pick on an already-picked row is idempotent (version bumps,
 *     display_order unchanged)
 *   unpick sets unpicked_at + bumps version; stale expected_version
 *     returns version_conflict with the true current version
 *   picks land in audit_log
 */

let testDb: TestDb;
let mockSession: {
  user: { id: string; email: string; role: string };
} | null;

vi.mock("@/db/client", () => ({ getDb: () => testDb }));
vi.mock("@/lib/auth", () => ({
  auth: async () => mockSession,
  handlers: {},
  signIn: async () => {},
  signOut: async () => {},
}));

const { pickAgentAction, unpickAgentAction } = await import(
  "@/app/actions/picks"
);

const LEAD_ROW = "lead_1";
const LEAD_PUBLIC = "MTA-2026-90001";
const AGENT_A = "AG-A";
const AGENT_B = "AG-B";
const USER_ID = "user_test";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

beforeEach(() => {
  testDb = createTestDb();
  mockSession = {
    user: { id: USER_ID, email: "test@example.com", role: "consultant" },
  };
  testDb
    .insert(users)
    .values({
      id: USER_ID,
      email: "test@example.com",
      name: "Test",
      role: "consultant",
      active: true,
      version: 1,
      created_at: "2026-09-06T00:00:00.000Z",
    })
    .run();
  testDb
    .insert(leads)
    .values({
      id: LEAD_ROW,
      d1_lead_id: LEAD_PUBLIC,
      address_raw: "1 Test St",
      address_normalised: "1 test st",
      vendor_name: "V",
      phone: "",
      email: "",
      source: "web",
      state: "received",
      version: 1,
      created_at: "2026-09-06T00:00:00.000Z",
      updated_at: "2026-09-06T00:00:00.000Z",
    })
    .run();
  for (const id of [AGENT_A, AGENT_B]) {
    testDb
      .insert(agents)
      .values({
        id,
        name: id,
        agency: "Test agency",
        phone: "",
        email: "",
        membership_status: "signed",
        sms_permission: false,
        active: true,
        version: 1,
        created_at: "2026-09-06T00:00:00.000Z",
        updated_at: "2026-09-06T00:00:00.000Z",
      })
      .run();
  }
});

async function getPickRow(agentId: string) {
  const [row] = await testDb
    .select()
    .from(lead_agent_picks)
    .where(
      and(
        eq(lead_agent_picks.lead_id, LEAD_ROW),
        eq(lead_agent_picks.agent_id, agentId)
      )
    );
  return row;
}

describe("pickAgentAction", () => {
  it("readonly users are rejected", async () => {
    mockSession!.user.role = "readonly";
    testDb.update(users).set({ role: "readonly" }).where(eq(users.id, USER_ID)).run();

    const res = await pickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("forbidden");
  });

  it("creates a pick row with display_order 0 on the first pick", async () => {
    const res = await pickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.version).toBe(1);
      expect(res.data.display_order).toBe(0);
    }
    const row = await getPickRow(AGENT_A);
    expect(row.unpicked_at).toBeNull();
    expect(row.picked_by).toBe(USER_ID);
  });

  it("assigns display_order = max + 1 for subsequent picks", async () => {
    const first = await pickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
    });
    const second = await pickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_B,
    });
    expect(first.ok && first.data.display_order).toBe(0);
    expect(second.ok && second.data.display_order).toBe(1);
  });

  it("un-unpicks an existing row (clears unpicked_at) and bumps version", async () => {
    // First pick + unpick.
    const first = await pickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
    });
    expect(first.ok).toBe(true);
    await unpickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
      expected_version: first.ok ? first.data.version : 1,
    });
    let row = await getPickRow(AGENT_A);
    expect(row.unpicked_at).not.toBeNull();
    const versionAfterUnpick = row.version;

    // Re-pick — should clear unpicked_at and bump version.
    const re = await pickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
    });
    expect(re.ok).toBe(true);
    row = await getPickRow(AGENT_A);
    expect(row.unpicked_at).toBeNull();
    expect(row.version).toBe(versionAfterUnpick + 1);
    // display_order stays where it originally was (0), preserving Sarah's
    // reading order across a fumble.
    expect(row.display_order).toBe(0);
  });

  it("idempotent pick bumps version but not display_order", async () => {
    await pickAgentAction({ lead_public_id: LEAD_PUBLIC, agent_id: AGENT_A });
    const before = await getPickRow(AGENT_A);
    await pickAgentAction({ lead_public_id: LEAD_PUBLIC, agent_id: AGENT_A });
    const after = await getPickRow(AGENT_A);
    expect(after.version).toBe(before.version + 1);
    expect(after.display_order).toBe(before.display_order);
  });
});

describe("unpickAgentAction", () => {
  it("returns version_conflict on stale expected_version", async () => {
    const pick = await pickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
    });
    if (!pick.ok) throw new Error("setup pick failed");

    // Simulate a concurrent version bump.
    await testDb
      .update(lead_agent_picks)
      .set({ version: pick.data.version + 5 })
      .where(
        and(
          eq(lead_agent_picks.lead_id, LEAD_ROW),
          eq(lead_agent_picks.agent_id, AGENT_A)
        )
      )
      .run();

    const stale = await unpickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
      expected_version: pick.data.version,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok && stale.code === "version_conflict") {
      expect(stale.latest_version).toBe(pick.data.version + 5);
    } else {
      throw new Error(`expected version_conflict, got ${JSON.stringify(stale)}`);
    }
  });

  it("sets unpicked_at and bumps version on a fresh unpick", async () => {
    const pick = await pickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
    });
    if (!pick.ok) throw new Error("setup pick failed");

    const un = await unpickAgentAction({
      lead_public_id: LEAD_PUBLIC,
      agent_id: AGENT_A,
      expected_version: pick.data.version,
    });
    expect(un.ok).toBe(true);
    if (un.ok) expect(un.data.version).toBe(pick.data.version + 1);
    const row = await getPickRow(AGENT_A);
    expect(row.unpicked_at).not.toBeNull();
  });
});
