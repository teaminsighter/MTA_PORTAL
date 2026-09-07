/*
 * HMAC-SHA256 verification for webhook payloads.
 *
 * Kept in a standalone module so both the /api/leads/webhook route and
 * future AC webhook handlers can share it.
 *
 * Uses Web Crypto (available in Node 20+, edge runtime, and Workers)
 * with a constant-time hex comparison to avoid timing side channels.
 */

const encoder = new TextEncoder();

export async function verifyHmacSha256(
  body: string,
  signatureHex: string,
  secret: string
): Promise<boolean> {
  if (!signatureHex) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = bytesToHex(new Uint8Array(mac));
  return timingSafeEqualHex(expected, signatureHex.toLowerCase());
}

/**
 * Convenience: compute a hex signature (used by scripts, not by the
 * verify path).
 */
export async function signHmacSha256(
  body: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return bytesToHex(new Uint8Array(mac));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
