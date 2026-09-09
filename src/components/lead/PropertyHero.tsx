"use client";

import { useState, useTransition } from "react";
import { AlertOctagon, Check, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PropertyFacts, Provenance } from "@/lib/mock";
import { updatePropertyFieldsAction } from "@/app/actions/properties";
import { cn } from "@/lib/utils";
import {
  formatDateNZ,
  formatMoneyNZ,
  formatMoneyNZCompact,
  formatRelative,
} from "@/lib/utils";

/*
 * Property hero band with an inline edit mode.
 *
 * Display mode: CV | Δ | Estimate hero + compact spec line, source
 * captions per value.
 *
 * Edit mode (Edit button top-right):
 *   - Every fact becomes an inline input styled with .neu-inset-sm
 *     so the "editable" state is obvious.
 *   - Each input saves its own field on blur via
 *     updatePropertyFieldsAction. One field per call keeps the
 *     mental model simple and the per-field provenance ("manual ·
 *     just now") always in step with what the user just typed.
 *   - Version bumps once per successful save; we track it locally so
 *     back-to-back edits don't 409 themselves.
 *   - 409 from a concurrent editor → warning chip with a reload
 *     button, matching the AgentRow pattern.
 */

interface PropertyHeroProps {
  leadPublicId: string;
  property: PropertyFacts;
  /** DB row version, 0 when no property row exists yet. */
  initialVersion: number;
}

type Field =
  | "cv"
  | "estimate"
  | "land_area"
  | "floor_area"
  | "bedrooms"
  | "year_built"
  | "last_sold_date"
  | "last_sold_price";

type BannerState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "conflict"; latestVersion: number }
  | { kind: "error"; message: string };

export function PropertyHero({
  leadPublicId,
  property,
  initialVersion,
}: PropertyHeroProps) {
  const [editing, setEditing] = useState(false);
  const [facts, setFacts] = useState<PropertyFacts>(property);
  const [version, setVersion] = useState<number>(initialVersion);
  const [banner, setBanner] = useState<BannerState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const delta = priceDelta(facts.cv, facts.estimate);

  function save(field: Field, newValue: number | string | null) {
    startTransition(async () => {
      setBanner({ kind: "saving" });
      const patch: Record<string, number | string | null> = {};
      patch[field] = newValue;
      const res = await updatePropertyFieldsAction({
        lead_public_id: leadPublicId,
        expected_version: version,
        patch: patch as Parameters<typeof updatePropertyFieldsAction>[0]["patch"],
      });
      if (res.ok) {
        setVersion(res.data.version);
        // Optimistic local update of the provenance chip.
        setFacts((prev) => ({
          ...prev,
          [field]:
            newValue === null || newValue === undefined
              ? undefined
              : {
                  value: newValue,
                  source: "manual",
                  fetched_at: res.data.updated_at,
                },
        }));
        setBanner({ kind: "saved", at: res.data.updated_at });
        return;
      }
      if (res.code === "version_conflict") {
        setBanner({ kind: "conflict", latestVersion: res.latest_version });
        return;
      }
      setBanner({
        kind: "error",
        message:
          res.code === "validation"
            ? "That value isn't valid."
            : res.code === "forbidden"
              ? "You can't edit this property."
              : "Save failed.",
      });
    });
  }

  return (
    <section className="neu-raised p-6 flex flex-col gap-4">
      {/* Header row: Edit toggle + save-status banner */}
      <div className="flex items-start justify-between gap-3">
        <div className="t-caption text-text-subtle uppercase tracking-wide">
          Property snapshot
        </div>
        <div className="flex items-center gap-2">
          <SaveBanner
            state={banner}
            pending={pending}
            onReload={() => router.refresh()}
          />
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="neu-raised-sm px-3 py-1.5 t-caption font-medium text-text-muted flex items-center gap-1"
          >
            <Pencil size={12} />
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {/* Hero band: CV | Δ | Estimate */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4">
        <HeroValueCell
          label="Capital value"
          fact={facts.cv}
          editing={editing}
          kind="money"
          onSave={(v) => save("cv", v)}
          align="left"
        />

        <div className="flex sm:flex-col items-center justify-center gap-1">
          <span
            aria-hidden
            className="t-caption text-text-subtle uppercase tracking-wide"
          >
            Δ
          </span>
          {delta ? (
            <span
              className={cn(
                "chip tabular",
                delta.tone === "success" && "chip-success",
                delta.tone === "warning" && "chip-warning",
                delta.tone === "danger" && "chip-danger",
                delta.tone === "neutral" && "chip-neutral"
              )}
              aria-label={`Estimate is ${delta.label} versus capital value`}
            >
              {delta.label}
            </span>
          ) : (
            <span className="chip chip-neutral">—</span>
          )}
        </div>

        <HeroValueCell
          label="Estimate"
          fact={facts.estimate}
          editing={editing}
          kind="money"
          onSave={(v) => save("estimate", v)}
          align="left-sm-right"
        />
      </div>

      {/* Spec line — grid of small inputs in edit mode; dot-separated
          text in read mode. Same fields either way. */}
      {editing ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SpecField
            label="Land (m²)"
            fact={facts.land_area}
            kind="int"
            onSave={(v) => save("land_area", v)}
          />
          <SpecField
            label="Floor (m²)"
            fact={facts.floor_area}
            kind="int"
            onSave={(v) => save("floor_area", v)}
          />
          <SpecField
            label="Bedrooms"
            fact={facts.bedrooms}
            kind="int"
            onSave={(v) => save("bedrooms", v)}
          />
          <SpecField
            label="Year built"
            fact={facts.year_built}
            kind="int"
            onSave={(v) => save("year_built", v)}
          />
          <SpecField
            label="Last sold date"
            fact={facts.last_sold_date}
            kind="date"
            onSave={(v) => save("last_sold_date", v)}
          />
          <SpecField
            label="Last sold price"
            fact={facts.last_sold_price}
            kind="money"
            onSave={(v) => save("last_sold_price", v)}
          />
        </div>
      ) : (
        <SpecLine facts={facts} />
      )}
    </section>
  );
}

/* ---------------------- cells ---------------------- */

interface HeroValueCellProps {
  label: string;
  fact: Provenance<number> | undefined;
  editing: boolean;
  kind: "money";
  align: "left" | "right" | "left-sm-right";
  onSave: (value: number | null) => void;
}

function HeroValueCell({
  label,
  fact,
  editing,
  align,
  onSave,
}: HeroValueCellProps) {
  const alignClass = cn(
    "flex flex-col gap-1 min-w-0",
    align === "right" && "items-end text-right",
    align === "left" && "items-start text-left",
    align === "left-sm-right" &&
      "items-start text-left sm:items-end sm:text-right"
  );

  return (
    <div className={alignClass}>
      <span className="t-caption text-text-subtle uppercase tracking-wide">
        {label}
      </span>
      {editing ? (
        <MoneyInput initial={fact?.value ?? null} onCommit={onSave} hero />
      ) : (
        <span
          className="t-display tabular leading-none"
          title={fact ? formatMoneyNZ(fact.value) : "—"}
          aria-label={fact ? formatMoneyNZ(fact.value) : "no value"}
        >
          {fact ? formatMoneyNZCompact(fact.value) : "—"}
        </span>
      )}
      <SourceCaption fact={fact} />
    </div>
  );
}

interface SpecFieldProps {
  label: string;
  fact: Provenance<number> | Provenance<string> | undefined;
  kind: "money" | "int" | "date";
  onSave: (value: number | string | null) => void;
}

function SpecField({ label, fact, kind, onSave }: SpecFieldProps) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="t-caption text-text-subtle uppercase tracking-wide">
        {label}
      </span>
      {kind === "money" ? (
        <MoneyInput
          initial={(fact?.value as number | undefined) ?? null}
          onCommit={onSave}
        />
      ) : kind === "int" ? (
        <IntInput
          initial={(fact?.value as number | undefined) ?? null}
          onCommit={onSave}
        />
      ) : (
        <DateInput
          initial={(fact?.value as string | undefined) ?? null}
          onCommit={onSave}
        />
      )}
      <SourceCaption fact={fact} />
    </label>
  );
}

/* ---------------------- inputs ---------------------- */

function MoneyInput({
  initial,
  onCommit,
  hero,
}: {
  initial: number | null;
  onCommit: (value: number | null) => void;
  hero?: boolean;
}) {
  const [raw, setRaw] = useState<string>(initial != null ? String(initial) : "");

  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => {
        const current = raw === "" ? null : Number(raw);
        if (current === initial) return;
        onCommit(current);
      }}
      className={cn(
        "neu-input tabular",
        hero
          ? "t-display leading-none py-2 text-inherit"
          : "t-body"
      )}
      placeholder="—"
      aria-label="value in dollars"
    />
  );
}

function IntInput({
  initial,
  onCommit,
}: {
  initial: number | null;
  onCommit: (value: number | null) => void;
}) {
  const [raw, setRaw] = useState<string>(initial != null ? String(initial) : "");
  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => {
        const current = raw === "" ? null : Number(raw);
        if (current === initial) return;
        onCommit(current);
      }}
      className="neu-input tabular t-body"
      placeholder="—"
    />
  );
}

function DateInput({
  initial,
  onCommit,
}: {
  initial: string | null;
  onCommit: (value: string | null) => void;
}) {
  // Store only the yyyy-mm-dd date portion.
  const initialDate = initial ? initial.slice(0, 10) : "";
  const [raw, setRaw] = useState<string>(initialDate);
  return (
    <input
      type="date"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        const current = raw === "" ? null : raw;
        if (current === initialDate) return;
        onCommit(current);
      }}
      className="neu-input tabular t-body"
    />
  );
}

/* ---------------------- read-only spec line ---------------------- */

function SpecLine({ facts }: { facts: PropertyFacts }) {
  const parts: string[] = [];
  if (facts.land_area?.value)
    parts.push(`${facts.land_area.value.toLocaleString("en-NZ")} m² land`);
  if (facts.floor_area?.value)
    parts.push(`${facts.floor_area.value.toLocaleString("en-NZ")} m² floor`);
  if (facts.bedrooms?.value) parts.push(`${facts.bedrooms.value} bed`);
  if (facts.year_built?.value) parts.push(`built ${facts.year_built.value}`);
  if (facts.last_sold_date?.value) {
    const price = facts.last_sold_price?.value
      ? ` (${formatMoneyNZ(facts.last_sold_price.value)})`
      : "";
    parts.push(`sold ${formatDateNZ(facts.last_sold_date.value)}${price}`);
  }
  if (parts.length === 0) return null;
  return (
    <p className="t-body text-text-muted">
      {parts.map((p, i) => (
        <span key={p}>
          {i > 0 ? (
            <span aria-hidden className="text-text-subtle mx-2">
              ·
            </span>
          ) : null}
          <span>{p}</span>
        </span>
      ))}
    </p>
  );
}

/* ---------------------- shared caption + banner ---------------------- */

function SourceCaption({
  fact,
}: {
  fact: Provenance<unknown> | undefined;
}) {
  if (!fact) return null;
  return (
    <span className="t-caption text-text-muted">
      {fact.source === "manual" ? "manual" : `from ${fact.source}`}
      {" · "}
      {formatRelative(fact.fetched_at)}
    </span>
  );
}

function SaveBanner({
  state,
  pending,
  onReload,
}: {
  state: BannerState;
  pending: boolean;
  onReload: () => void;
}) {
  if (pending || state.kind === "saving") {
    return (
      <span className="chip chip-neutral t-caption">Saving…</span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="chip chip-success t-caption">
        <Check size={11} /> Saved
      </span>
    );
  }
  if (state.kind === "conflict") {
    return (
      <span className="chip chip-warning t-caption flex items-center gap-1">
        <AlertOctagon size={11} />
        Updated by someone else
        <button
          type="button"
          onClick={onReload}
          className="underline underline-offset-2 font-semibold ml-1"
        >
          reload
        </button>
      </span>
    );
  }
  if (state.kind === "error") {
    return <span className="chip chip-danger t-caption">{state.message}</span>;
  }
  return null;
}

/* ---------------------- pure delta helper ---------------------- */

function priceDelta(
  cv?: Provenance<number>,
  est?: Provenance<number>
): {
  pct: number;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
} | null {
  if (!cv?.value || !est?.value) return null;
  const pct = ((est.value - cv.value) / cv.value) * 100;
  const rounded = Math.round(pct);
  const label = `${rounded > 0 ? "+" : ""}${rounded}%`;
  const abs = Math.abs(rounded);
  if (rounded <= -8) return { pct: rounded, label, tone: "danger" };
  if (rounded >= 8) return { pct: rounded, label, tone: "success" };
  if (abs <= 3) return { pct: rounded, label, tone: "neutral" };
  return { pct: rounded, label, tone: "warning" };
}
