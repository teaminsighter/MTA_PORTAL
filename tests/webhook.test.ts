import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";

/*
 * Automated cover of the ingest webhook checks:
 *   1. bad-signature → 401
 *   3. valid payload → 200 + deduplicates on repeat
 *   4. FRESH submitted_at each call → distinct sequential ids
 *   5. malformed payload → 400 with field-level detail
 *   6. 32-request burst → 30x 200, 2x 429
 *
 * Uses an in-memory SQLite via drizzle-orm/better-sqlite3. The
 * production route imports getDb() from @/db/client; vi.mock swaps
 * it here for a per-test fresh DB so tests are hermetic and can run
 * in parallel.
 */

let testDb: TestDb;

vi.mock("@/db/client", () => ({
  // Lazy closure — resolved each call, so beforeEach can rotate the DB.
  getDb: () => testDb,
}));

// Import after vi.mock is hoisted, so the route picks up the mock.
const { POST } = await import("@/app/api/leads/webhook/route");
const { resetRateLimit } = await import("@/lib/rate-limit");

const SECRET = "test-secret-32-bytes-abcdef1234567890";

beforeAll(() => {
  process.env.WEBHOOK_HMAC_SECRET = SECRET;
});

beforeEach(() => {
  testDb = createTestDb();
  resetRateLimit();
});

/* --------------------------- helpers --------------------------- */

const encoder = new TextEncoder();

async function sign(body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function req(body: string, opts: { signature?: string; ip?: string } = {}) {
  return new Request("http://localhost/api/leads/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mta-signature": opts.signature ?? "",
      "x-forwarded-for": opts.ip ?? "127.0.0.1",
    },
    body,
  });
}

interface ValidPayload {
  address: string;
  vendor_name: string;
  phone: string;
  email: string;
  source?: "web" | "ac_import" | "ac_manual";
  submitted_at?: string;
}

function payload(overrides: Partial<ValidPayload> = {}): ValidPayload {
  return {
    address: "42 Test St, Ponsonby, Auckland 1011",
    vendor_name: "Test Vendor",
    phone: "+64 21 000 0000",
    email: "test@example.com",
    source: "web",
    submitted_at: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

/* --------------------------- tests --------------------------- */

describe("POST /api/leads/webhook", () => {
  it("check 1: rejects a request with a bad signature (401)", async () => {
    const body = JSON.stringify(payload());
    const res = await POST(req(body, { signature: "deadbeef" }));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_signature");
  });

  it("check 1b: rejects a request with no signature at all (401)", async () => {
    const body = JSON.stringify(payload());
    const res = await POST(req(body));
    expect(res.status).toBe(401);
  });

  it("check 3: accepts a valid signed payload and deduplicates on repeat", async () => {
    const body = JSON.stringify(payload());
    const signature = await sign(body);

    const first = await POST(req(body, { signature }));
    const firstJson = (await first.json()) as {
      ok: boolean;
      d1_lead_id: string;
      deduped?: boolean;
    };
    expect(first.status).toBe(200);
    expect(firstJson.ok).toBe(true);
    expect(firstJson.d1_lead_id).toMatch(/^MTA-\d{4}-\d{5}$/);
    expect(firstJson.deduped).toBeUndefined();

    // Same body → same idempotency hash → deduped.
    const second = await POST(req(body, { signature }));
    const secondJson = (await second.json()) as {
      ok: boolean;
      d1_lead_id: string;
      deduped?: boolean;
    };
    expect(second.status).toBe(200);
    expect(secondJson.d1_lead_id).toBe(firstJson.d1_lead_id);
    expect(secondJson.deduped).toBe(true);
  });

  it("check 4: fresh submitted_at each call → distinct sequential ids", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const body = JSON.stringify(
        payload({ submitted_at: `2026-09-06T00:00:0${i}.000Z` })
      );
      const res = await POST(req(body, { signature: await sign(body) }));
      const j = (await res.json()) as { d1_lead_id: string };
      ids.push(j.d1_lead_id);
    }
    expect(new Set(ids).size).toBe(4);
    // Counter starts at 0 for a fresh test DB; first call inserts value=1.
    const nums = ids.map((id) => Number(id.split("-").at(-1)));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]).toBe(nums[i - 1] + 1);
    }
  });

  it("check 5: malformed payload → 400 with field-level detail", async () => {
    const body = JSON.stringify({}); // all required fields missing
    const res = await POST(req(body, { signature: await sign(body) }));
    expect(res.status).toBe(400);
    const j = (await res.json()) as {
      error: string;
      detail?: { fieldErrors: Record<string, string[]> };
    };
    expect(j.error).toBe("invalid_payload");
    expect(j.detail?.fieldErrors.address).toBeDefined();
    expect(j.detail?.fieldErrors.vendor_name).toBeDefined();
    expect(j.detail?.fieldErrors.phone).toBeDefined();
    expect(j.detail?.fieldErrors.email).toBeDefined();
  });

  it("check 6: 32-request burst — 30x 200, 2x 429", async () => {
    // All requests share the same IP so they hit the same bucket.
    const ip = "203.0.113.7";
    // Same-body dedupe path is the fastest 200 route — it hits the
    // idempotency check and returns without touching the counter.
    const body = JSON.stringify(payload({ address: "1 Burst St" }));
    const signature = await sign(body);

    const responses = await Promise.all(
      Array.from({ length: 32 }, () =>
        POST(req(body, { signature, ip }))
      )
    );
    const codes = responses.map((r) => r.status);
    const twoHundreds = codes.filter((c) => c === 200).length;
    const rateLimited = codes.filter((c) => c === 429).length;
    expect(twoHundreds).toBe(30);
    expect(rateLimited).toBe(2);
    expect(twoHundreds + rateLimited).toBe(32);
  });
});
