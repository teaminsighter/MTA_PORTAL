/*
 * Idempotency key for the ingest webhook.
 *
 * Two submissions with the same normalised address + email + phone +
 * exact submitted_at collapse to a single lead. That handles the
 * common retry-on-network-blip case without collapsing intentional
 * re-submissions from the same vendor a day later (submitted_at
 * differs).
 *
 * Normalisation is deliberately blunt — lowercase, strip everything
 * that isn't alphanumeric in the address; digits+`+` only in the
 * phone. It's an idempotency hint, not an addressing scheme.
 */

const encoder = new TextEncoder();

export interface IdempotencyInput {
  address: string;
  email: string;
  phone: string;
  submitted_at: string;
}

export async function idempotencyKey(input: IdempotencyInput): Promise<string> {
  const parts = [
    input.address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    input.email.toLowerCase().trim(),
    input.phone.replace(/[^0-9+]/g, ""),
    input.submitted_at,
  ].join("|");
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(parts));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
