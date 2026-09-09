import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import {
  agents,
  agent_candidates,
  agent_contact_log,
  audit_log,
  lead_agent_picks,
  leads,
  users,
} from "@/db/schema";

/*
 * Candidate flow — Phase 4 sub-3:
 *
 *   logCandidateContactAction
 *     - role gate
 *     - writes an agent_contact_log row keyed to (candidate, lead)
 *     - flips candidate.status 'new' → 'contacted'; leaves other
 *       statuses alone
 *     - audit row action=candidate.contact_logged
 *
 *   promoteCandidateAction
 *     - creates an Agent row with membership_status='verbally_agreed'
 *     - captures SMS consent: yes_verbal / yes_sms → sms_permission
 *       true + sms_consent_method recorded; no/unknown → false
 *     - auto-picks the new agent onto the lead with display_order
 *       = max+1
 *     - marks the candidate promoted + match_agent_id set
 *     - refuses to promote a candidate that's already promoted or
 *       dismissed
 *     - audit row action=candidate.promoted
 *
 *   dismissCandidateAction
 *     - sets status='dismissed'
 *     - refuses to dismiss a promoted candidate
 *     - audit row action=candidate.dismissed
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

const {
  logCandidateContactAction,
  promoteCandidateAction,
  dismissCandidateAction,
} = await import("@/app/actions/candidates");

const LEAD_ROW = "lead_1";
const LEAD_PUBLIC = "MTA-2026-90001";
const CAND_ID = "cand_test_1";
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
  testDb
    .insert(agent_candidates)
    .values({
      id: CAND_ID,
      name_raw: "Piripi Katene",
      name_normalised: "piripi katene",
      agency: "LJ Hooker",
      phone: "+64 21 111 2222",
      email: "piripi@example.com",
      source: "comparable",
      first_seen_lead_id: LEAD_ROW,
      confidence: "medium",
      status: "new",
      reason_hint: "Two nearby comps",
      version: 1,
      created_at: "2026-09-06T00:00:00.000Z",
      updated_at: "2026-09-06T00:00:00.000Z",
    })
    .run();
});

/* ------------------------- log outcome ------------------------- */

describe("logCandidateContactAction", () => {
  it("readonly rejected", async () => {
    mockSession!.user.role = "readonly";
    testDb.update(users).set({ role: "readonly" }).where(eq(users.id, USER_ID)).run();
    const res = await logCandidateContactAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      channel: "call",
      outcome: "answered",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("forbidden");
  });

  it("inserts a contact log row and moves 'new' → 'contacted'", async () => {
    const res = await logCandidateContactAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      channel: "call",
      outcome: "voicemail",
      note: "Left a message about the Ponsonby listing",
    });
    expect(res.ok).toBe(true);

    const [logRow] = await testDb.select().from(agent_contact_log);
    expect(logRow.candidate_id).toBe(CAND_ID);
    expect(logRow.lead_id).toBe(LEAD_ROW);
    expect(logRow.channel).toBe("call");
    expect(logRow.outcome).toBe("voicemail");
    expect(logRow.note).toContain("Ponsonby");

    const [cand] = await testDb
      .select()
      .from(agent_candidates)
      .where(eq(agent_candidates.id, CAND_ID));
    expect(cand.status).toBe("contacted");
  });

  it("does not overwrite existing non-'new' status", async () => {
    // Promote path or manual dismiss would move status; make sure
    // logging on a 'contacted' candidate is fine and doesn't touch
    // status back.
    testDb
      .update(agent_candidates)
      .set({ status: "contacted" })
      .where(eq(agent_candidates.id, CAND_ID))
      .run();
    const res = await logCandidateContactAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      channel: "email",
      outcome: "no_answer",
    });
    expect(res.ok).toBe(true);
    const [cand] = await testDb
      .select()
      .from(agent_candidates)
      .where(eq(agent_candidates.id, CAND_ID));
    expect(cand.status).toBe("contacted");
  });

  it("writes an audit row action=candidate.contact_logged", async () => {
    await logCandidateContactAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      channel: "call",
      outcome: "answered",
    });
    const audits = await testDb.select().from(audit_log);
    expect(
      audits.some((r) => r.action === "candidate.contact_logged")
    ).toBe(true);
  });
});

/* ------------------------- promote ------------------------- */

describe("promoteCandidateAction", () => {
  it("creates a signed(-ish) agent, captures SMS consent, auto-picks", async () => {
    const res = await promoteCandidateAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      sms_consent: "yes_verbal",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("promote failed");
    const agentId = res.data.agent_id;

    const [agent] = await testDb
      .select()
      .from(agents)
      .where(eq(agents.id, agentId));
    expect(agent.membership_status).toBe("verbally_agreed");
    expect(agent.sms_permission).toBe(true);
    expect(agent.sms_consent_method).toBe("verbal_on_call");
    expect(agent.sms_consent_at).toBeTruthy();
    expect(agent.name).toBe("Piripi Katene");

    const [cand] = await testDb
      .select()
      .from(agent_candidates)
      .where(eq(agent_candidates.id, CAND_ID));
    expect(cand.status).toBe("promoted");
    expect(cand.match_agent_id).toBe(agentId);

    const [pick] = await testDb
      .select()
      .from(lead_agent_picks)
      .where(
        and(
          eq(lead_agent_picks.lead_id, LEAD_ROW),
          eq(lead_agent_picks.agent_id, agentId)
        )
      );
    expect(pick).toBeDefined();
    expect(pick.unpicked_at).toBeNull();
    expect(pick.display_order).toBe(0);
  });

  it("no consent → sms_permission=false + method=declined", async () => {
    const res = await promoteCandidateAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      sms_consent: "no",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("promote failed");
    const [agent] = await testDb
      .select()
      .from(agents)
      .where(eq(agents.id, res.data.agent_id));
    expect(agent.sms_permission).toBe(false);
    expect(agent.sms_consent_method).toBe("declined");
  });

  it("display_order is max+1 across existing picks", async () => {
    // Seed an existing agent + a pick at display_order=3 so the new
    // promotion should land at 4.
    testDb
      .insert(agents)
      .values({
        id: "existing_agent_1",
        name: "Existing",
        agency: "X",
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
    testDb
      .insert(lead_agent_picks)
      .values({
        id: "pick_existing",
        lead_id: LEAD_ROW,
        agent_id: "existing_agent_1",
        display_order: 3,
        picked_by: USER_ID,
        picked_at: "2026-09-06T00:00:00.000Z",
        version: 1,
      })
      .run();
    const res = await promoteCandidateAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      sms_consent: "unknown",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("promote failed");
    const [pick] = await testDb
      .select()
      .from(lead_agent_picks)
      .where(eq(lead_agent_picks.agent_id, res.data.agent_id));
    expect(pick.display_order).toBe(4);
  });

  it("refuses to promote an already-resolved candidate", async () => {
    testDb
      .update(agent_candidates)
      .set({ status: "dismissed" })
      .where(eq(agent_candidates.id, CAND_ID))
      .run();
    const res = await promoteCandidateAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      sms_consent: "unknown",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("validation");
  });

  it("writes an audit row action=candidate.promoted", async () => {
    await promoteCandidateAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      sms_consent: "unknown",
    });
    const audits = await testDb.select().from(audit_log);
    expect(audits.some((r) => r.action === "candidate.promoted")).toBe(true);
  });
});

/* ------------------------- dismiss ------------------------- */

describe("dismissCandidateAction", () => {
  it("sets status=dismissed", async () => {
    const res = await dismissCandidateAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
      reason: "not a good fit",
    });
    expect(res.ok).toBe(true);
    const [cand] = await testDb
      .select()
      .from(agent_candidates)
      .where(eq(agent_candidates.id, CAND_ID));
    expect(cand.status).toBe("dismissed");
  });

  it("refuses to dismiss a promoted candidate", async () => {
    testDb
      .update(agent_candidates)
      .set({ status: "promoted" })
      .where(eq(agent_candidates.id, CAND_ID))
      .run();
    const res = await dismissCandidateAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("validation");
  });

  it("writes an audit row action=candidate.dismissed", async () => {
    await dismissCandidateAction({
      candidate_id: CAND_ID,
      lead_public_id: LEAD_PUBLIC,
    });
    const audits = await testDb.select().from(audit_log);
    expect(audits.some((r) => r.action === "candidate.dismissed")).toBe(true);
  });
});
