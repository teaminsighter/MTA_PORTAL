import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { leads } from "@/db/schema";
import type { InboxResponse } from "@/app/api/inbox/route";

/*
 * /api/inbox contract:
 *   401 when no session
 *   200 with { leads, total, by_state } otherwise
 *   seed_placeholder rows excluded from both counts and the list
 *   list capped and ordered newest-first
 */

let testDb: TestDb;
let mockSession: { user: { id: string; email: string; role: string } } | null;

vi.mock("@/db/client", () => ({ getDb: () => testDb }));
vi.mock("@/lib/auth", () => ({
  auth: async () => mockSession,
  handlers: {},
  signIn: async () => {},
  signOut: async () => {},
}));

const { GET } = await import("@/app/api/inbox/route");

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

beforeEach(() => {
  testDb = createTestDb();
  mockSession = {
    user: { id: "user_test", email: "test@example.com", role: "consultant" },
  };
});

function insertLead(overrides: {
  d1_lead_id: string;
  state?: string;
  source?: string;
  created_at: string;
}) {
  testDb.insert(leads).values({
    id: `lead_${overrides.d1_lead_id}`,
    d1_lead_id: overrides.d1_lead_id,
    address_raw: `${overrides.d1_lead_id} address`,
    address_normalised: overrides.d1_lead_id.toLowerCase(),
    vendor_name: "Test",
    phone: "",
    email: "",
    source: (overrides.source ?? "web") as
      | "web"
      | "ac_import"
      | "ac_manual"
      | "seed_placeholder",
    state: (overrides.state ?? "received") as
      | "received"
      | "enriching"
      | "ready_for_review"
      | "dispatching"
      | "sent"
      | "partial_send"
      | "awaiting_agent_responses"
      | "agent_appointed"
      | "listed"
      | "sold",
    version: 1,
    created_at: overrides.created_at,
    updated_at: overrides.created_at,
  }).run();
}

describe("GET /api/inbox", () => {
  it("returns 401 when there is no session", async () => {
    mockSession = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty inbox when the DB has no leads", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as InboxResponse;
    expect(j.leads).toEqual([]);
    expect(j.total).toBe(0);
    expect(Object.values(j.by_state).every((n: number) => n === 0)).toBe(true);
  });

  it("returns leads sorted newest-first with per-state counts", async () => {
    insertLead({
      d1_lead_id: "MTA-2026-00001",
      state: "received",
      created_at: "2026-09-01T00:00:00.000Z",
    });
    insertLead({
      d1_lead_id: "MTA-2026-00002",
      state: "sent",
      created_at: "2026-09-05T00:00:00.000Z",
    });
    insertLead({
      d1_lead_id: "MTA-2026-00003",
      state: "received",
      created_at: "2026-09-03T00:00:00.000Z",
    });

    const res = await GET();
    const j = (await res.json()) as InboxResponse;
    expect(res.status).toBe(200);
    expect(j.leads.map((l) => l.id)).toEqual([
      "MTA-2026-00002",
      "MTA-2026-00003",
      "MTA-2026-00001",
    ]);
    expect(j.total).toBe(3);
    expect(j.by_state.received).toBe(2);
    expect(j.by_state.sent).toBe(1);
  });

  it("excludes seed_placeholder rows from both list and counts", async () => {
    insertLead({
      d1_lead_id: "MTA-2026-00001",
      state: "received",
      created_at: "2026-09-01T00:00:00.000Z",
    });
    insertLead({
      d1_lead_id: "MTA-2026-00099",
      state: "sold",
      source: "seed_placeholder",
      created_at: "2025-01-01T00:00:00.000Z",
    });

    const res = await GET();
    const j = (await res.json()) as InboxResponse;
    expect(j.leads.map((l) => l.id)).toEqual(["MTA-2026-00001"]);
    expect(j.total).toBe(1);
    expect(j.by_state.sold).toBe(0);
  });
});
