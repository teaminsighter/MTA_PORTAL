import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { properties as propertiesTable } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
import type { PropertyFacts, Provenance } from "@/lib/mock";

type PropertyRow = typeof propertiesTable.$inferSelect;

function fact<T>(
  value: T | null | undefined,
  source: string | null | undefined,
  fetchedAt: string | null | undefined
): Provenance<T> | undefined {
  if (value === null || value === undefined) return undefined;
  return {
    value,
    source: source ?? "manual",
    fetched_at: fetchedAt ?? new Date().toISOString(),
  };
}

function toFacts(row: PropertyRow): PropertyFacts {
  return {
    cv: fact(row.cv, row.cv_source, row.cv_fetched_at),
    land_value: fact(
      row.land_value,
      row.land_value_source,
      row.land_value_fetched_at
    ),
    improvements: fact(
      row.improvements,
      row.improvements_source,
      row.improvements_fetched_at
    ),
    estimate: fact(
      row.estimate,
      row.estimate_source,
      row.estimate_fetched_at
    ),
    land_area: fact(
      row.land_area,
      row.land_area_source,
      row.land_area_fetched_at
    ),
    floor_area: fact(
      row.floor_area,
      row.floor_area_source,
      row.floor_area_fetched_at
    ),
    bedrooms: fact(
      row.bedrooms,
      row.bedrooms_source,
      row.bedrooms_fetched_at
    ),
    year_built: fact(
      row.year_built,
      row.year_built_source,
      row.year_built_fetched_at
    ),
    last_sold_date: fact(
      row.last_sold_date,
      row.last_sold_date_source,
      row.last_sold_date_fetched_at
    ),
    last_sold_price: fact(
      row.last_sold_price,
      row.last_sold_price_source,
      row.last_sold_price_fetched_at
    ),
  };
}

/**
 * Property + row version so callers can optimistic-write via
 * updatePropertyFieldsAction. If no property row exists yet, version
 * comes back as 0 — the create-path signal for the action.
 */
export interface PropertyBundle {
  facts: PropertyFacts;
  version: number;
}

export async function getPropertyForLead(
  publicLeadId: string
): Promise<PropertyBundle | null> {
  const rowId = await getLeadRowId(publicLeadId);
  if (!rowId) return null;
  const [row] = await getDb()
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.lead_id, rowId))
    .limit(1);
  if (!row) {
    // Lead exists but no property row yet — return an empty bundle at
    // version 0 so the workspace can render empty tiles and the edit
    // action knows to INSERT on the first save.
    return { facts: {}, version: 0 };
  }
  return { facts: toFacts(row), version: row.version };
}
