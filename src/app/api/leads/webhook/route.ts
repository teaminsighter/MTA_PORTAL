export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { leads } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { verifyHmacSha256 } from "@/lib/hmac";
import { idempotencyKey } from "@/lib/leads/idempotency";
import { nextD1LeadId } from "@/lib/leads/id";
import { isRateLimited } from "@/lib/rate-limit";

/*
 * POST /api/leads/webhook — public. Middleware excludes it from the
 * signed-in matcher; authenticity is proven by the HMAC signature.
 *
 * Contract (all envelope shapes handled here so downstream can trust it):
 *
 *   headers:  X-MTA-Signature: <hex sha256 hmac of raw body>
 *             Content-Type:    application/json
 *   body:     { address, vendor_name, phone, email, source?, submitted_at? }
 *   200:      { ok: true, d1_lead_id, deduped?: true }
 *   400:      { error: "invalid_json" | "invalid_payload" }
 *   401:      { error: "invalid_signature" }
 *   429:      { error: "rate_limited" }
 *   500:      { error: "WEBHOOK_HMAC_SECRET not configured" | "internal" }
 *
 * Order matters:
 *   1. rate-limit    — cheapest, run first, blocks a hostile flood.
 *   2. HMAC verify   — must read the *raw* body so Zod's coercions don't
 *                       change the bytes being signed.
 *   3. Zod parse     — reject malformed payloads before any DB work.
 *   4. Idempotency   — dedupe on hash before generating an id.
 *   5. Insert        — sequential id + audit.
 */

const Payload = z.object({
  address: z.string().trim().min(1).max(500),
  vendor_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(200),
  source: z
    .enum(["web", "ac_import", "ac_manual"])
    .default("web"),
  submitted_at: z.string().datetime().optional(),
});

const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_HMAC_SECRET;
  if (!secret) {
    return json(
      { error: "WEBHOOK_HMAC_SECRET not configured" },
      { status: 500 }
    );
  }

  // 1. Rate limit
  const ip = clientIp(req);
  if (isRateLimited(`lead-webhook:${ip}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs)) {
    return json({ error: "rate_limited" }, { status: 429 });
  }

  // 2. HMAC verify — sign the exact bytes we received
  const rawBody = await req.text();
  const signature = req.headers.get("x-mta-signature") ?? "";
  const sigOk = await verifyHmacSha256(rawBody, signature, secret);
  if (!sigOk) {
    return json({ error: "invalid_signature" }, { status: 401 });
  }

  // 3. Zod parse
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Payload.safeParse(parsedJson);
  if (!parsed.success) {
    return json(
      { error: "invalid_payload", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const submittedAt = parsed.data.submitted_at ?? new Date().toISOString();
  const idem = await idempotencyKey({
    address: parsed.data.address,
    email: parsed.data.email,
    phone: parsed.data.phone,
    submitted_at: submittedAt,
  });

  const db = getDb();

  // 4. Dedupe
  const [existing] = await db
    .select({ d1_lead_id: leads.d1_lead_id })
    .from(leads)
    .where(eq(leads.webhook_idempotency_key, idem))
    .limit(1);
  if (existing) {
    return json(
      { ok: true, d1_lead_id: existing.d1_lead_id, deduped: true },
      { status: 200 }
    );
  }

  // 5. Insert with generated d1_lead_id. On a rare UNIQUE collision
  //    (two concurrent inserts racing for the same next-id) we retry
  //    once — the second call re-reads MAX and picks the next slot.
  for (let attempt = 0; attempt < 2; attempt++) {
    const d1_lead_id = await nextD1LeadId();
    const pk = `lead_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const normalised = parsed.data.address
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    try {
      await db.insert(leads).values({
        id: pk,
        d1_lead_id,
        address_raw: parsed.data.address,
        address_normalised: normalised,
        vendor_name: parsed.data.vendor_name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        source: parsed.data.source,
        state: "received",
        version: 1,
        created_at: submittedAt,
        updated_at: now,
        webhook_idempotency_key: idem,
      });

      await logAudit({
        action: "lead.received",
        entity_type: "lead",
        entity_id: pk,
        lead_id: pk,
        after: {
          d1_lead_id,
          source: parsed.data.source,
          address: parsed.data.address,
          ip,
        },
      });

      return json({ ok: true, d1_lead_id }, { status: 200 });
    } catch (e) {
      const msg = String(e);
      if (
        attempt === 0 &&
        (msg.includes("UNIQUE") || msg.includes("constraint"))
      ) {
        continue;
      }
      console.error("[webhook] insert failed:", e);
      return json({ error: "internal" }, { status: 500 });
    }
  }

  return json({ error: "internal" }, { status: 500 });
}

/* -------------------- helpers -------------------- */

function clientIp(req: Request): string {
  // Preference order matches Cloudflare's guidance: cf-connecting-ip
  // is the trusted client IP once we're behind CF; x-forwarded-for is
  // the fallback for local dev / other reverse proxies.
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function json<T>(body: T, init?: ResponseInit) {
  return Response.json(body, init);
}
