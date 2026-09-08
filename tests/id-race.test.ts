import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";

/*
 * Race-safety proof for nextD1LeadId.
 *
 * The counter-row approach (INSERT ... ON CONFLICT DO UPDATE SET
 * value = value + 1 RETURNING value) is one statement, atomic under
 * SQLite's writer lock. Twenty in-flight callers should each get a
 * distinct NNNNN with no gaps and no duplicates.
 *
 * We drive it through the whole ingest path (not just nextD1LeadId)
 * so the audit_log write, the leads-insert, and the counter increment
 * all race against each other realistically.
 */

let testDb: TestDb;

vi.mock("@/db/client", () => ({
  getDb: () => testDb,
}));

const { POST } = await import("@/app/api/leads/webhook/route");
const { resetRateLimit } = await import("@/lib/rate-limit");

const SECRET = "race-test-secret";
const encoder = new TextEncoder();

beforeAll(() => {
  process.env.WEBHOOK_HMAC_SECRET = SECRET;
});

beforeEach(() => {
  testDb = createTestDb();
  resetRateLimit();
});

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("nextD1LeadId race safety", () => {
  it("20 concurrent ingests → 20 distinct sequential ids, no gaps", async () => {
    const N = 20;

    // Each request must have distinct address/email/phone/submitted_at so
    // idempotency dedupe doesn't collapse them and mask the race.
    const requests = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const body = JSON.stringify({
          address: `${i + 1} Race Ave, Ponsonby, Auckland 1011`,
          vendor_name: `Vendor ${i + 1}`,
          phone: `+64 21 000 ${String(i + 1).padStart(4, "0")}`,
          email: `race${i + 1}@example.com`,
          source: "web",
          // Distinct sub-ms suffix keeps each idempotency hash unique.
          submitted_at: `2026-09-06T00:00:00.${String(i).padStart(3, "0")}Z`,
        });
        return {
          body,
          req: new Request("http://localhost/api/leads/webhook", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-mta-signature": await sign(body),
              // Every request from a different IP so the burst doesn't
              // clip against the 30/60s rate limit.
              "x-forwarded-for": `10.0.0.${i + 1}`,
            },
            body,
          }),
        };
      })
    );

    const responses = await Promise.all(requests.map((r) => POST(r.req)));

    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<{ ok: boolean; d1_lead_id: string }>)
    );

    // Every request succeeded.
    expect(responses.every((r) => r.status === 200)).toBe(true);

    // All ids match the format and are unique.
    const ids = bodies.map((b) => b.d1_lead_id);
    expect(new Set(ids).size).toBe(N);
    expect(ids.every((id) => /^MTA-\d{4}-\d{5}$/.test(id))).toBe(true);

    // Numeric parts form a contiguous run starting at 1 (fresh counter).
    const nums = ids.map((id) => Number(id.split("-").at(-1))).sort((a, b) => a - b);
    expect(nums[0]).toBe(1);
    expect(nums[nums.length - 1]).toBe(N);
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]).toBe(nums[i - 1] + 1);
    }
  });
});
