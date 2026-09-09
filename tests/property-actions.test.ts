import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { leads, properties, users, audit_log } from "@/db/schema";

/*
 * updatePropertyFieldsAction — Phase 4 sub-1:
 *   role gate (readonly rejected, consultant/admin accepted)
 *   expected_version === 0 creates the row (INSERT + provenance)
 *   subsequent write bumps version by 1
 *   patched fields get source='manual' + fetched_at=now; unpatched
 *     fields untouched
 *   stale expected_version → { code: "version_conflict", latest_version }
 *   empty patch rejected as validation error
 *   audit_log row landed
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

const { updatePropertyFieldsAction } = await import("@/app/actions/properties");

const LEAD_ROW_ID = "lead_row_1";
const LEAD_PUBLIC = "MTA-2026-90001";
const USER_ID = "user_test";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

beforeEach(() => {
  testDb = createTestDb();
  mockSession = {
    user: { id: USER_ID, email: "test@example.com", role: "consultant" },
  };
  // Users row: the guard re-reads role + active per call.
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
  // Lead row so getLeadRowId resolves.
  testDb
    .insert(leads)
    .values({
      id: LEAD_ROW_ID,
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
});

describe("updatePropertyFieldsAction", () => {
  it("rejects readonly users with a forbidden result", async () => {
    // Update the users row to readonly and match the session.
    mockSession!.user.role = "readonly";
    testDb
      .update(users)
      .set({ role: "readonly" })
      .where(eq(users.id, USER_ID))
      .run();

    const res = await updatePropertyFieldsAction({
      lead_public_id: LEAD_PUBLIC,
      expected_version: 0,
      patch: { cv: 2_000_000 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("forbidden");
  });

  it("creates the property row on first save (version=1)", async () => {
    const res = await updatePropertyFieldsAction({
      lead_public_id: LEAD_PUBLIC,
      expected_version: 0,
      patch: { cv: 2_150_000, estimate: 2_340_000, bedrooms: 4 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.version).toBe(1);

    const [row] = await testDb
      .select()
      .from(properties)
      .where(eq(properties.lead_id, LEAD_ROW_ID));
    expect(row).toBeDefined();
    expect(row.cv).toBe(2_150_000);
    expect(row.cv_source).toBe("manual");
    expect(row.cv_fetched_at).toBeTruthy();
    expect(row.estimate).toBe(2_340_000);
    expect(row.estimate_source).toBe("manual");
    expect(row.bedrooms).toBe(4);
    // Unpatched fields stay null with no provenance.
    expect(row.land_area).toBeNull();
    expect(row.land_area_source).toBeNull();
    expect(row.version).toBe(1);
  });

  it("bumps version on subsequent writes and stamps only patched fields", async () => {
    const create = await updatePropertyFieldsAction({
      lead_public_id: LEAD_PUBLIC,
      expected_version: 0,
      patch: { cv: 2_000_000 },
    });
    expect(create.ok).toBe(true);
    if (!create.ok) throw new Error("setup");

    const update = await updatePropertyFieldsAction({
      lead_public_id: LEAD_PUBLIC,
      expected_version: create.data.version,
      patch: { estimate: 2_400_000 },
    });
    expect(update.ok).toBe(true);
    if (update.ok) expect(update.data.version).toBe(2);

    const [row] = await testDb
      .select()
      .from(properties)
      .where(eq(properties.lead_id, LEAD_ROW_ID));
    expect(row.cv).toBe(2_000_000);
    expect(row.estimate).toBe(2_400_000);
    expect(row.estimate_source).toBe("manual");
    expect(row.version).toBe(2);
  });

  it("returns version_conflict on stale expected_version", async () => {
    const create = await updatePropertyFieldsAction({
      lead_public_id: LEAD_PUBLIC,
      expected_version: 0,
      patch: { cv: 1_000_000 },
    });
    expect(create.ok).toBe(true);

    // Simulate a concurrent write bumping version to 2.
    await testDb
      .update(properties)
      .set({ estimate: 500_000, version: 2 })
      .where(eq(properties.lead_id, LEAD_ROW_ID))
      .run();

    const stale = await updatePropertyFieldsAction({
      lead_public_id: LEAD_PUBLIC,
      expected_version: 1,
      patch: { cv: 999_999 },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok && stale.code === "version_conflict") {
      expect(stale.latest_version).toBe(2);
    } else {
      throw new Error(`expected version_conflict, got ${JSON.stringify(stale)}`);
    }
  });

  it("rejects an empty patch as validation error", async () => {
    const res = await updatePropertyFieldsAction({
      lead_public_id: LEAD_PUBLIC,
      expected_version: 0,
      patch: {} as never,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("validation");
  });

  it("writes an audit_log row per save", async () => {
    await updatePropertyFieldsAction({
      lead_public_id: LEAD_PUBLIC,
      expected_version: 0,
      patch: { cv: 2_000_000 },
    });
    const audit = await testDb.select().from(audit_log);
    const createRow = audit.find((r) => r.action === "property.create");
    expect(createRow).toBeDefined();
    expect(createRow?.lead_id).toBe(LEAD_ROW_ID);
  });
});
