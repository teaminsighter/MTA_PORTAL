import type { Agent } from "@/lib/mock";

/*
 * Agent performance score, 0–10.
 *
 * Derived from the same signals the shortlist algorithm uses so the
 * badge on the row aligns with why an agent surfaced in the first place:
 *
 *   - sales_last_12mo    (0–40 range → 0–4 points)   throughput
 *   - avg_days_on_market (15d → 4pts, 60d → 0pts)     speed to close
 *   - nearby_sales       (0–8 → 0–2 points)           local track record
 *
 * Rating is a demo-time derivation, not a stored field. Once we have
 * real reviews / conversion data, swap the body — the callers just
 * read a number.
 */
export function agentRating(a: Agent): number {
  const sales = clamp01(a.sales_last_12mo / 40) * 4;
  const dom = clamp01(1 - (a.avg_days_on_market - 15) / 45) * 4;
  const local = clamp01(a.nearby_sales / 8) * 2;
  return Math.round((sales + dom + local) * 10) / 10;
}

export type RatingTier = "excellent" | "strong" | "ok";

export function ratingTier(score: number): RatingTier {
  if (score >= 8.5) return "excellent";
  if (score >= 7) return "strong";
  return "ok";
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
