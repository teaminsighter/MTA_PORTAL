"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Mail, MessageSquare, X } from "lucide-react";
import type { Lead } from "@/lib/mock";
import { cn } from "@/lib/utils";

type Kind = "sms" | "email";

interface TemplatePackModalProps {
  open: boolean;
  kind: Kind;
  vendor: Lead;
  onClose: () => void;
}

interface Template {
  id: string;
  title: string;
  audience: "agent" | "vendor";
  when: string;
  body: string;
  subject?: string;
}

/*
 * Pre-drafted SMS + Email pack. Sarah picks a template, edits inline
 * if needed, then copies or sends. All templates share the same
 * personalisation tokens ({{vendor.name}}, {{property.address}},
 * {{agent.name}}, {{sarah.name}}) which the demo fills from the
 * current lead. Real sends go through the dispatcher.
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

  useEffect(() => {
    if (!open) return;
    setActiveId(templates[0]?.id ?? "");
    setDraft(templates[0]?.body ?? "");
    setSubject(templates[0]?.subject ?? "");
    setCopied(false);
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
            <span className="chip chip-neutral">
              {templates.length} templates
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

        <div className="grid md:grid-cols-[220px_1fr] flex-1 min-h-0">
          <ul className="border-b md:border-b-0 md:border-r border-border-strong overflow-y-auto p-2 flex flex-row md:flex-col gap-1 shrink-0">
            {templates.map((t) => (
              <li key={t.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => selectTemplate(t.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-neu-sm transition-colors",
                    activeId === t.id
                      ? "neu-inset-sm text-text"
                      : "hover:bg-neutral-bg text-text-muted"
                  )}
                >
                  <div className="t-body font-medium truncate">{t.title}</div>
                  <div className="t-caption text-text-subtle truncate">
                    {t.audience === "vendor" ? "Vendor" : "Agent"} · {t.when}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col p-5 gap-3 min-h-0">
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
/* Template library. 3 SMS + 3 Email agent templates, 1 vendor packet */
/* per channel — the seven the plan settled on. Personalisation       */
/* tokens fill from the current lead so the preview is production-y.  */
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
        body:
          `Hi {{agent.name}}, MyTopAgent here. We've matched you for ${A} — vendor ${V}. Interested? Reply YES for the brief, STOP to opt out.`,
      },
      {
        id: "S2",
        title: "24h follow-up",
        audience: "agent",
        when: "24h no reply",
        body:
          `Kia ora {{agent.name}}, quick nudge — ${A} vendor is shortlisting today. Still keen? Reply YES / NO.`,
      },
      {
        id: "S3",
        title: "Final nudge",
        audience: "agent",
        when: "72h no reply",
        body:
          `Last check on ${A} — vendor picks tonight. YES to opt in, no reply = we move on. Cheers, Sarah / MTA. Reply STOP to opt out.`,
      },
      {
        id: "SV1",
        title: "Vendor packet ready",
        audience: "vendor",
        when: "On agent confirmations",
        body:
          `Hi ${V}, your three matched agents are confirmed and their briefs are with you now. Check your inbox — we'll ring in 10.`,
      },
    ];
  }

  return [
    {
      id: "E1",
      title: "Intro pitch — full context",
      audience: "agent",
      when: "First send",
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
      title: "Vendor packet (the last email)",
      audience: "vendor",
      when: "On Send to vendor",
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
  ];
}
