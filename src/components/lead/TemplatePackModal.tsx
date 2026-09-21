"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  HandMetal,
  Mail,
  MessageSquare,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { Lead } from "@/lib/mock";
import { cn } from "@/lib/utils";

type Kind = "sms" | "email";
type Audience = "agent" | "vendor";
type Mode = "auto" | "manual";

interface TemplatePackModalProps {
  open: boolean;
  kind: Kind;
  vendor: Lead;
  onClose: () => void;
}

interface Template {
  id: string;
  title: string;
  audience: Audience;
  /** Human-readable trigger, shown in sidebar (e.g. "24h no reply"). */
  when: string;
  /** Longer trigger phrase used in the automation banner. */
  trigger: string;
  /** Default automation posture. Auto = fires on the trigger event without
      Sarah lifting a finger. Manual = only sent when she clicks send. */
  mode: Mode;
  body: string;
  subject?: string;
}

/*
 * Pre-drafted SMS + Email pack. Sarah picks a template, edits inline
 * if needed, then copies or sends. All templates share the same
 * personalisation tokens ({{vendor.name}}, {{property.address}},
 * {{agent.name}}, {{sarah.name}}) which the demo fills from the
 * current lead. Real sends go through the dispatcher.
 *
 * The sidebar groups by audience (Agent vs Vendor) so the two
 * lifecycles read separately. Each template carries a mode
 * (auto/manual) — Sarah can flip a template between "fires
 * automatically on trigger X" and "I'll send it myself" from the
 * banner above the editor.
 */
export function TemplatePackModal({
  open,
  kind,
  vendor,
  onClose,
}: TemplatePackModalProps) {
  const templates = useMemo(() => buildTemplates(kind, vendor), [kind, vendor]);
  const [activeId, setActiveId] = useState<string>(templates[0]?.id ?? "");
  const [draft, setDraft] = useState<string>(templates[0]?.body ?? "");
  const [subject, setSubject] = useState<string>(templates[0]?.subject ?? "");
  const [copied, setCopied] = useState(false);
  /*
   * Local overrides for automation mode. Demo-only: lets the client see
   * the auto ↔ manual toggle actually flip. Keyed by template id so
   * flipping one doesn't affect the others; reset when the modal closes.
   */
  const [modeOverrides, setModeOverrides] = useState<Record<string, Mode>>({});

  const active = templates.find((t) => t.id === activeId) ?? templates[0];
  const activeMode: Mode = active
    ? (modeOverrides[active.id] ?? active.mode)
    : "manual";

  useEffect(() => {
    if (!open) return;
    setActiveId(templates[0]?.id ?? "");
    setDraft(templates[0]?.body ?? "");
    setSubject(templates[0]?.subject ?? "");
    setCopied(false);
    setModeOverrides({});
  }, [open, templates]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function selectTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setActiveId(id);
    setDraft(t.body);
    setSubject(t.subject ?? "");
    setCopied(false);
  }

  function toggleMode() {
    if (!active) return;
    setModeOverrides((prev) => ({
      ...prev,
      [active.id]: activeMode === "auto" ? "manual" : "auto",
    }));
  }

  async function copyDraft() {
    try {
      const payload =
        kind === "email" && subject ? `Subject: ${subject}\n\n${draft}` : draft;
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  const agentTemplates = templates.filter((t) => t.audience === "agent");
  const vendorTemplates = templates.filter((t) => t.audience === "vendor");
  const autoCount = templates.filter(
    (t) => (modeOverrides[t.id] ?? t.mode) === "auto"
  ).length;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-pack-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm anim-fade-in"
      />

      <div className="relative neu-raised w-full max-w-3xl flex flex-col max-h-[86dvh] anim-modal-in">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-strong">
          <div className="flex items-center gap-2 min-w-0">
            {kind === "sms" ? (
              <MessageSquare size={16} aria-hidden />
            ) : (
              <Mail size={16} aria-hidden />
            )}
            <h2 id="template-pack-title" className="t-section">
              {kind === "sms" ? "SMS pack" : "Email pack"}
            </h2>
            <span className="chip chip-neutral tabular">
              {templates.length} templates
            </span>
            <span className="chip chip-warning tabular flex items-center gap-1">
              <Zap size={11} aria-hidden />
              {autoCount} automated
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-neu-sm flex items-center justify-center text-text-muted hover:text-text hover:bg-neutral-bg"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid md:grid-cols-[260px_1fr] flex-1 min-h-0">
          <div className="border-b md:border-b-0 md:border-r border-border-strong overflow-y-auto p-3 flex flex-col gap-4 shrink-0">
            <TemplateGroup
              icon={<UserRound size={12} aria-hidden />}
              label="To agent"
              count={agentTemplates.length}
              tone="agent"
            >
              {agentTemplates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  active={activeId === t.id}
                  mode={modeOverrides[t.id] ?? t.mode}
                  onSelect={() => selectTemplate(t.id)}
                />
              ))}
            </TemplateGroup>

            <TemplateGroup
              icon={<Users size={12} aria-hidden />}
              label="To vendor"
              count={vendorTemplates.length}
              tone="vendor"
            >
              {vendorTemplates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  active={activeId === t.id}
                  mode={modeOverrides[t.id] ?? t.mode}
                  onSelect={() => selectTemplate(t.id)}
                />
              ))}
            </TemplateGroup>
          </div>

          <div className="flex flex-col p-5 gap-3 min-h-0">
            {active ? (
              <AutomationBanner
                template={active}
                mode={activeMode}
                onToggle={toggleMode}
              />
            ) : null}

            {kind === "email" ? (
              <label className="flex flex-col gap-1">
                <span className="t-caption text-text-muted">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="neu-input"
                />
              </label>
            ) : null}
            <label className="flex flex-col gap-1 flex-1 min-h-0">
              <span className="t-caption text-text-muted flex items-center gap-2">
                {kind === "sms" ? "Message" : "Body"}
                <span className="t-caption text-text-subtle tabular">
                  {draft.length}
                  {kind === "sms" ? " / 160" : ""}
                </span>
              </span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="neu-input resize-none flex-1 min-h-[220px] font-mono text-[13px] leading-6"
                spellCheck
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="t-caption text-text-subtle">
                Tokens auto-fill from the lead. Edit freely.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyDraft}
                  className="neu-raised-sm px-3 py-2 t-body flex items-center gap-2"
                >
                  <Copy size={13} aria-hidden />
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-accent-glass px-4 py-2 justify-center"
                >
                  {kind === "sms" ? "Send SMS" : "Send email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar group — an audience header + the templates that target it. */
/* Colour-coded so agent vs vendor read at a glance instead of Sarah  */
/* having to read the small "Agent" / "Vendor" hint under each row.   */
/* ------------------------------------------------------------------ */
function TemplateGroup({
  icon,
  label,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "agent" | "vendor";
  children: React.ReactNode;
}) {
  const palette =
    tone === "agent"
      ? { bg: "var(--accent-soft-bg)", fg: "var(--accent)" }
      : { bg: "var(--info-bg)", fg: "var(--info)" };
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-neu-sm w-fit"
        style={{ background: palette.bg, color: palette.fg }}
      >
        {icon}
        <span className="t-caption font-semibold uppercase tracking-wide">
          {label}
        </span>
        <span className="t-caption tabular">·</span>
        <span className="t-caption tabular">{count}</span>
      </div>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar row — one template. Shows title, trigger, and the current  */
/* automation posture with a small icon (⚡ auto / ✋ manual).         */
/* ------------------------------------------------------------------ */
function TemplateRow({
  template,
  active,
  mode,
  onSelect,
}: {
  template: Template;
  active: boolean;
  mode: Mode;
  onSelect: () => void;
}) {
  const isAuto = mode === "auto";
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full text-left px-2.5 py-2 rounded-neu-sm transition-colors flex items-start gap-2",
          active
            ? "neu-inset-sm text-text"
            : "hover:bg-neutral-bg text-text-muted"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-1 h-1.5 w-1.5 rounded-full shrink-0",
            active ? "opacity-100" : "opacity-60"
          )}
          style={{
            background:
              template.audience === "agent"
                ? "var(--accent)"
                : "var(--info)",
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="t-body font-medium truncate">{template.title}</div>
          <div className="t-caption text-text-subtle truncate">
            {template.when}
          </div>
        </div>
        <span
          title={isAuto ? "Auto-sends on trigger" : "Manual send only"}
          aria-label={isAuto ? "Automated" : "Manual"}
          className={cn(
            "shrink-0 h-5 w-5 rounded-neu-sm flex items-center justify-center",
            isAuto ? "text-[color:var(--warning)]" : "text-text-subtle"
          )}
          style={
            isAuto
              ? { background: "var(--warning-bg)" }
              : { background: "var(--neutral-bg)" }
          }
        >
          {isAuto ? (
            <Zap size={11} aria-hidden />
          ) : (
            <HandMetal size={11} aria-hidden />
          )}
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Automation banner — sits above subject/body. Names the trigger     */
/* event that fires the template (or the fact that it's manual) and   */
/* offers a toggle so Sarah can flip between the two.                 */
/* ------------------------------------------------------------------ */
function AutomationBanner({
  template,
  mode,
  onToggle,
}: {
  template: Template;
  mode: Mode;
  onToggle: () => void;
}) {
  const isAuto = mode === "auto";
  const audienceLabel = template.audience === "agent" ? "agent" : "vendor";
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-neu-sm border transition-colors",
        isAuto
          ? "border-[color:var(--warning)]/30"
          : "border-border-strong"
      )}
      style={{
        background: isAuto
          ? "color-mix(in oklab, var(--warning-bg) 70%, transparent)"
          : "var(--neutral-bg)",
      }}
    >
      <div
        className="h-8 w-8 rounded-neu-sm flex items-center justify-center shrink-0"
        style={
          isAuto
            ? { background: "var(--warning-bg)", color: "var(--warning)" }
            : { background: "var(--surface)", color: "var(--text-muted)" }
        }
      >
        {isAuto ? (
          <Zap size={14} aria-hidden />
        ) : (
          <HandMetal size={14} aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="t-body font-semibold">
          {isAuto ? "Sends automatically" : "Manual send only"}
        </div>
        <div className="t-caption text-text-muted truncate">
          {isAuto
            ? `Fires to the ${audienceLabel} when: ${template.trigger}`
            : `You'll send this to the ${audienceLabel} yourself — no trigger.`}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={isAuto}
        aria-label={
          isAuto ? "Switch to manual send" : "Switch to auto-send"
        }
        title={isAuto ? "Click to switch to manual" : "Click to enable auto-send"}
        className={cn(
          "shrink-0 h-8 px-3 rounded-neu-pill flex items-center gap-1.5 t-caption font-semibold transition-colors",
          isAuto
            ? "text-on-accent"
            : "neu-raised-sm text-text-muted hover:text-text"
        )}
        style={
          isAuto
            ? { background: "var(--warning)", color: "white" }
            : undefined
        }
      >
        {isAuto ? (
          <Zap size={12} aria-hidden />
        ) : (
          <HandMetal size={12} aria-hidden />
        )}
        <span>{isAuto ? "Automated" : "Manual"}</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template library. Agent + vendor templates for both channels,      */
/* covering the whole lead lifecycle (intake → shortlist → packet →   */
/* post-appraisal → post-sale). Personalisation tokens fill from the  */
/* current lead so the preview is production-y.                       */
/*                                                                    */
/* mode = default automation posture; Sarah can override from the UI. */
/* Auto templates fire without her lifting a finger on the trigger    */
/* event. Manual templates need a deliberate send.                    */
/* ------------------------------------------------------------------ */
function buildTemplates(kind: Kind, vendor: Lead): Template[] {
  const V = vendor.vendor_name;
  const A = vendor.address;

  if (kind === "sms") {
    return [
      {
        id: "S1",
        title: "Intro pitch",
        audience: "agent",
        when: "First send",
        trigger: "shortlist confirmed & Send fires",
        mode: "auto",
        body:
          `Hi {{agent.name}}, MyTopAgent here. We've matched you for ${A} — vendor ${V}. Interested? Reply YES for the brief, STOP to opt out.`,
      },
      {
        id: "S2",
        title: "24h follow-up",
        audience: "agent",
        when: "24h no reply",
        trigger: "24h after intro, still no reply",
        mode: "auto",
        body:
          `Kia ora {{agent.name}}, quick nudge — ${A} vendor is shortlisting today. Still keen? Reply YES / NO.`,
      },
      {
        id: "S3",
        title: "Final nudge",
        audience: "agent",
        when: "72h no reply",
        trigger: "72h after intro, still no reply",
        mode: "manual",
        body:
          `Last check on ${A} — vendor picks tonight. YES to opt in, no reply = we move on. Cheers, Sarah / MTA. Reply STOP to opt out.`,
      },
      {
        id: "SV1",
        title: "Welcome — enquiry received",
        audience: "vendor",
        when: "Right after intake",
        trigger: "lead lands in the inbox",
        mode: "auto",
        body:
          `Kia ora ${V}, Sarah from MyTopAgent. Got your enquiry for ${A} — I'm lining up 3 top local agents and will be back within 24h with the shortlist. Any Qs, reply here.`,
      },
      {
        id: "SV2",
        title: "Shortlist in progress",
        audience: "vendor",
        when: "12h after intake",
        trigger: "12h after intake, no packet sent yet",
        mode: "auto",
        body:
          `Hi ${V}, quick update — 3 top agents in your suburb are reviewing ${A} now. First replies are landing. I'll send the full packet once they've all confirmed. — Sarah`,
      },
      {
        id: "SV3",
        title: "Vendor packet ready",
        audience: "vendor",
        when: "On agent confirmations",
        trigger: "vendor packet sent from workspace",
        mode: "auto",
        body:
          `Hi ${V}, your matched agents are confirmed and their briefs are in your inbox now. Give it a read — I'll ring in 10 to walk you through.`,
      },
      {
        id: "SV4",
        title: "Post-appraisal check-in",
        audience: "vendor",
        when: "2 days after meeting",
        trigger: "2 days after appraisal booking",
        mode: "manual",
        body:
          `Hi ${V}, how did the appraisal go? Happy to help you compare or line up another agent if it wasn't the right fit. — Sarah`,
      },
    ];
  }

  return [
    {
      id: "E1",
      title: "Intro pitch — full context",
      audience: "agent",
      when: "First send",
      trigger: "shortlist confirmed & Send fires",
      mode: "auto",
      subject: `Vendor match for ${A}`,
      body: [
        `Kia ora {{agent.name}},`,
        ``,
        `${V} has just come to MyTopAgent looking to appraise ${A}. Based on your recent sales in the area, you're one of three agents we're inviting to pitch.`,
        ``,
        `Reply YES and we'll send the vendor brief and expected sale timeframe. Reply NO to pass.`,
        ``,
        `Cheers,`,
        `Sarah — MyTopAgent`,
      ].join("\n"),
    },
    {
      id: "E2",
      title: "24h follow-up",
      audience: "agent",
      when: "24h no reply",
      trigger: "24h after intro, still no reply",
      mode: "auto",
      subject: `Still keen on ${A}?`,
      body: [
        `Hi {{agent.name}},`,
        ``,
        `Circling back on ${A} — the vendor is picking their shortlist today. If you're in, reply YES and I'll get the brief across in the next 10 minutes.`,
        ``,
        `— Sarah`,
      ].join("\n"),
    },
    {
      id: "E3",
      title: "Recap with property details",
      audience: "agent",
      when: "When they ask for more",
      trigger: "agent asks for the full brief",
      mode: "manual",
      subject: `${A} — snapshot`,
      body: [
        `Hi {{agent.name}},`,
        ``,
        `Snapshot as requested:`,
        `• Address: ${A}`,
        `• Vendor: ${V}`,
        `• CV: (from lead)`,
        `• Land / floor / bed: (from lead)`,
        `• Nearby sales: (from lead)`,
        ``,
        `Let me know if you'd like the full comparables set.`,
        ``,
        `— Sarah`,
      ].join("\n"),
    },
    {
      id: "EV1",
      title: "Welcome — enquiry received",
      audience: "vendor",
      when: "Right after intake",
      trigger: "lead lands in the inbox",
      mode: "auto",
      subject: `We've got your enquiry for ${A}`,
      body: [
        `Kia ora ${V},`,
        ``,
        `Thanks for coming to MyTopAgent. I'm Sarah, your consultant — I'll be your single point of contact from now through to the day your home sells.`,
        ``,
        `Here's what happens next:`,
        `  1. I'll match you with the top 3 performing agents in your suburb (usually done within the hour).`,
        `  2. They confirm they're keen — I'll send you their profiles, recent nearby sales and expected sale timeframe.`,
        `  3. You choose who to meet with. No pressure, no obligation.`,
        ``,
        `Any questions in the meantime, reply to this email or call me directly.`,
        ``,
        `Ngā mihi,`,
        `Sarah — MyTopAgent`,
      ].join("\n"),
    },
    {
      id: "EV2",
      title: "Shortlist in progress",
      audience: "vendor",
      when: "12h after intake",
      trigger: "12h after intake, no packet sent yet",
      mode: "auto",
      subject: `Update on ${A} — shortlist coming together`,
      body: [
        `Hi ${V},`,
        ``,
        `Quick progress note — I've reached out to 3 of the top-performing agents in your suburb. Their recent nearby sales, average days on market and performance track record all look strong.`,
        ``,
        `Two have already come back keen; waiting on the third. I'll send the full packet with all their details as soon as we hear back (usually within 24 hours of the first outreach).`,
        ``,
        `You don't need to do anything yet — I'll be in touch.`,
        ``,
        `— Sarah`,
      ].join("\n"),
    },
    {
      id: "EV3",
      title: "Vendor packet (the shortlist)",
      audience: "vendor",
      when: "On Send to vendor",
      trigger: "Send-to-Vendor clicked in the workspace",
      mode: "auto",
      subject: `Your matched agents for ${A}`,
      body: [
        `Kia ora ${V},`,
        ``,
        `Three top-performing agents in your area have confirmed and want to pitch to sell ${A}. Their profiles and recent sales are below.`,
        ``,
        `1. {{agent1.name}} — {{agent1.agency}}`,
        `   Why: {{agent1.why}}`,
        ``,
        `2. {{agent2.name}} — {{agent2.agency}}`,
        `   Why: {{agent2.why}}`,
        ``,
        `3. {{agent3.name}} — {{agent3.agency}}`,
        `   Why: {{agent3.why}}`,
        ``,
        `Reply to this email with your preferred agent, or call me on +64 …`,
        ``,
        `Ngā mihi,`,
        `Sarah — MyTopAgent`,
      ].join("\n"),
    },
    {
      id: "EV4",
      title: "Post-appraisal check-in",
      audience: "vendor",
      when: "2 days after meeting",
      trigger: "2 days after appraisal booking",
      mode: "manual",
      subject: `How did the appraisal go for ${A}?`,
      body: [
        `Hi ${V},`,
        ``,
        `Hope the meeting went well. Wanted to check in and see:`,
        ``,
        `  • Did the appraisal feel realistic for the current market?`,
        `  • Was the marketing plan clear?`,
        `  • Any questions I can help unpack — commission, timeline, method of sale?`,
        ``,
        `If it wasn't the right fit, no problem — I can line up another agent from the shortlist. Just let me know.`,
        ``,
        `— Sarah`,
      ].join("\n"),
    },
    {
      id: "EV5",
      title: "Post-sale thanks + review",
      audience: "vendor",
      when: "After sold state",
      trigger: "lead state moves to sold",
      mode: "manual",
      subject: `Congrats on the sale of ${A}`,
      body: [
        `Kia ora ${V},`,
        ``,
        `Congratulations on the sale — massive result. It's been a pleasure working with you from that first enquiry through to today.`,
        ``,
        `Two small asks, only if you have a minute:`,
        `  1. A short review of your experience with MyTopAgent — it helps other vendors know what to expect.`,
        `  2. If you know anyone else thinking of selling, we'd love an introduction.`,
        ``,
        `Ngā mihi nui,`,
        `Sarah — MyTopAgent`,
      ].join("\n"),
    },
  ];
}
