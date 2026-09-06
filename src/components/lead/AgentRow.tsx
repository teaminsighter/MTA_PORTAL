"use client";

import { useId, useState, useTransition } from "react";
import {
  AlertOctagon,
  Check,
  ChevronDown,
  MessageSquare,
  Phone,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/lib/mock";
import { updateAgentAction } from "@/app/actions/agents";
import { cn } from "@/lib/utils";

interface AgentRowProps {
  agent: Agent;
  picked: boolean;
  onToggle: (agentId: string) => void;
}

/*
 * Collapsed height ≈ 56px. Five rows fit in the workspace centre column
 * without scrolling at 1440. Expanding surfaces the reason-hint editor,
 * phone, and per-year stats. Saving the reason calls updateAgentAction
 * with the row version; on version_conflict we surface an inline
 * "someone else updated" prompt and refresh the RSC data on click.
 */
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "conflict"; latestVersion: number }
  | { kind: "error"; message: string };

export function AgentRow({ agent, picked, onToggle }: AgentRowProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(agent.reason_hint);
  const [version, setVersion] = useState(agent.version ?? 1);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const panelId = useId();

  const dirty = reason !== agent.reason_hint && reason.trim().length > 0;

  function save() {
    startTransition(async () => {
      setState({ kind: "saving" });
      const res = await updateAgentAction({
        id: agent.id,
        expected_version: version,
        patch: { reason_hint: reason.trim() },
      });
      if (res.ok) {
        setVersion(res.data.version);
        setState({ kind: "saved" });
        return;
      }
      if (res.code === "version_conflict") {
        setState({ kind: "conflict", latestVersion: res.latest_version });
        return;
      }
      if (res.code === "forbidden" || res.code === "unauthenticated" || res.code === "inactive") {
        setState({ kind: "error", message: "You can't edit this agent." });
        return;
      }
      setState({
        kind: "error",
        message: res.code === "validation" ? "Reason too long or empty." : "Save failed.",
      });
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col transition-shadow",
        picked ? "neu-inset" : "neu-raised-sm"
      )}
    >
      {/* Row header */}
      <div className="flex items-center gap-3 pl-4 pr-2 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="t-body font-semibold truncate">{agent.name}</span>
              <span className="t-caption text-text-muted truncate">
                {agent.agency}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {agent.membership_status === "signed" ? (
              <span className="chip chip-success">Signed</span>
            ) : (
              <span className="chip chip-warning">Verbal</span>
            )}
            {agent.sms_permission ? (
              <span className="chip chip-info" aria-label="SMS consent">
                <MessageSquare size={11} /> SMS
              </span>
            ) : null}
            <span className="chip chip-neutral tabular">
              {agent.nearby_sales} nearby
            </span>
          </div>

          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              "text-text-muted transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={picked}
          aria-label={picked ? `Unpick ${agent.name}` : `Pick ${agent.name}`}
          onClick={() => onToggle(agent.id)}
          className={cn(
            "h-8 w-8 shrink-0 rounded-neu-sm flex items-center justify-center transition-colors",
            picked ? "text-on-accent" : "neu-raised-sm text-text-muted"
          )}
          style={picked ? { background: "var(--accent-gradient)" } : undefined}
        >
          {picked ? <Check size={16} className="anim-spring" /> : null}
        </button>
      </div>

      {/* Expandable body */}
      <div id={panelId} className="expand-row" data-open={open}>
        <div>
          <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t">
            <label className="flex flex-col gap-1">
              <span className="t-caption text-text-muted">
                Reason for vendor
              </span>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (state.kind !== "idle") setState({ kind: "idle" });
                }}
                rows={2}
                className="neu-input resize-none"
                placeholder="Why this agent for this vendor?"
              />
            </label>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap items-center gap-3 t-caption text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <Phone size={12} />
                  <span className="tabular">{agent.phone}</span>
                </span>
                <span aria-hidden>·</span>
                <span>{agent.sales_last_12mo}/yr</span>
                <span aria-hidden>·</span>
                <span>{agent.avg_days_on_market} avg days</span>
              </div>

              <SaveControl
                dirty={dirty}
                pending={pending}
                state={state}
                onSave={save}
                onRefresh={() => router.refresh()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
 * Small status area. Consolidates the Save button, "saved" tick,
 * validation errors, and the version_conflict banner in one spot so
 * the layout doesn't jump around while typing.
 */
function SaveControl({
  dirty,
  pending,
  state,
  onSave,
  onRefresh,
}: {
  dirty: boolean;
  pending: boolean;
  state: SaveState;
  onSave: () => void;
  onRefresh: () => void;
}) {
  if (state.kind === "conflict") {
    return (
      <div className="chip chip-warning t-caption flex items-center gap-1">
        <AlertOctagon size={11} />
        Updated by someone else
        <button
          type="button"
          onClick={onRefresh}
          className="underline underline-offset-2 font-semibold ml-1"
        >
          reload
        </button>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <span className="chip chip-danger t-caption">{state.message}</span>
    );
  }
  if (state.kind === "saved" && !dirty) {
    return (
      <span className="chip chip-success t-caption">
        <Check size={11} /> Saved
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={!dirty || pending}
      className="neu-raised-sm px-3 py-1.5 t-caption font-medium text-accent disabled:opacity-40"
    >
      {pending || state.kind === "saving" ? "Saving…" : "Save reason"}
    </button>
  );
}
