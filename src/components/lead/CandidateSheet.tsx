"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertOctagon,
  Check,
  Copy,
  Phone,
  UserPlus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { AgentCandidate } from "@/lib/mock";
import {
  dismissCandidateAction,
  logCandidateContactAction,
  promoteCandidateAction,
  type CallOutcome,
  type SmsConsent,
} from "@/app/actions/candidates";
import { cn } from "@/lib/utils";

/*
 * Candidate action sheet.
 *
 * One sheet handles the three things Sarah does with an unsigned
 * agent she just called: log the call outcome, promote them to a
 * real agent record with SMS consent captured, or dismiss.
 *
 * The Call button behaves per platform:
 *   - Coarse pointer (touch) → tel: link, phone dialler opens.
 *   - Fine pointer (desktop) → copies the number to clipboard,
 *     briefly shows "Copied" so the user knows it worked.
 * Detection uses matchMedia rather than user-agent sniffing because
 * a laptop with a touchscreen or a tablet with a mouse is a real
 * case; matchMedia gets it right.
 */

interface Props {
  leadPublicId: string;
  candidate: AgentCandidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Banner =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const OUTCOMES: { key: CallOutcome; label: string }[] = [
  { key: "answered", label: "Answered" },
  { key: "voicemail", label: "Voicemail" },
  { key: "no_answer", label: "No answer" },
  { key: "declined", label: "Declined" },
  { key: "agreed", label: "Agreed" },
];

const CONSENT_OPTIONS: { key: SmsConsent; label: string; hint: string }[] = [
  { key: "yes_verbal", label: "Yes — verbally on the call", hint: "sms_permission = true" },
  { key: "yes_sms", label: "Yes — replied to opt-in SMS", hint: "sms_permission = true" },
  { key: "no", label: "No — declined", hint: "sms_permission = false" },
  { key: "unknown", label: "Not asked yet", hint: "sms_permission = false" },
];

export function CandidateSheet({
  leadPublicId,
  candidate,
  open,
  onOpenChange,
}: Props) {
  const [outcome, setOutcome] = useState<CallOutcome>("answered");
  const [note, setNote] = useState("");
  const [smsConsent, setSmsConsent] = useState<SmsConsent>("unknown");
  const [banner, setBanner] = useState<Banner>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setOutcome("answered");
    setNote("");
    setSmsConsent("unknown");
    setBanner({ kind: "idle" });
  }

  function handleCall() {
    const isCoarse =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    if (isCoarse) {
      window.location.href = `tel:${candidate.phone.replace(/\s+/g, "")}`;
    } else {
      navigator.clipboard?.writeText(candidate.phone).then(
        () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        },
        () => setBanner({ kind: "error", message: "Couldn't copy — copy manually" })
      );
    }
  }

  function logCall() {
    startTransition(async () => {
      const res = await logCandidateContactAction({
        candidate_id: candidate.id,
        lead_public_id: leadPublicId,
        channel: "call",
        outcome,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        setBanner({ kind: "success", message: "Call logged." });
        router.refresh();
      } else {
        setBanner({ kind: "error", message: bannerFor(res.code) });
      }
    });
  }

  function promote() {
    startTransition(async () => {
      const res = await promoteCandidateAction({
        candidate_id: candidate.id,
        lead_public_id: leadPublicId,
        sms_consent: smsConsent,
      });
      if (res.ok) {
        // Candidate is now a picked agent — close the sheet and let
        // the parent re-render show the ticked card.
        router.refresh();
        onOpenChange(false);
        reset();
      } else {
        setBanner({ kind: "error", message: bannerFor(res.code) });
      }
    });
  }

  function dismiss() {
    startTransition(async () => {
      const res = await dismissCandidateAction({
        candidate_id: candidate.id,
        lead_public_id: leadPublicId,
        reason: note.trim() || undefined,
      });
      if (res.ok) {
        router.refresh();
        onOpenChange(false);
        reset();
      } else {
        setBanner({ kind: "error", message: bannerFor(res.code) });
      }
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.35)" }}
        />
        <Dialog.Content
          className={cn(
            "fixed z-50 bg-surface",
            // Full-screen sheet on mobile; centred card on desktop.
            "inset-x-0 bottom-0 rounded-t-neu-lg max-h-[92dvh] overflow-y-auto",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-[min(560px,92vw)] sm:rounded-neu-lg sm:max-h-[85dvh]",
            "neu-raised p-6 flex flex-col gap-5"
          )}
          aria-label={`Actions for candidate ${candidate.name}`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="t-section">
                {candidate.name}
              </Dialog.Title>
              <div className="t-caption text-text-muted">{candidate.agency}</div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="neu-raised-sm h-8 w-8 flex items-center justify-center text-text-muted"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          {/* Phone action row */}
          <div className="neu-inset-sm p-3 rounded-neu-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Phone size={14} className="text-text-muted shrink-0" />
              <span className="tabular truncate">{candidate.phone || "—"}</span>
            </div>
            <button
              type="button"
              onClick={handleCall}
              className="btn-accent-glass h-9 py-0 px-4 t-body"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Call"}
            </button>
          </div>

          {banner.kind !== "idle" ? (
            <div
              role="alert"
              className={cn(
                "neu-inset-sm p-3 t-body flex items-start gap-2",
                banner.kind === "success" && "text-success",
                banner.kind === "error" && "text-danger"
              )}
            >
              {banner.kind === "success" ? (
                <Check size={14} className="mt-0.5" />
              ) : (
                <AlertOctagon size={14} className="mt-0.5" />
              )}
              <span>{banner.message}</span>
            </div>
          ) : null}

          {/* Log call */}
          <section className="flex flex-col gap-3">
            <div className="t-caption text-text-subtle uppercase tracking-wide">
              Log call
            </div>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setOutcome(o.key)}
                  className={cn(
                    "chip",
                    outcome === o.key ? "chip-info" : "chip-neutral"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="t-caption text-text-muted">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="neu-input resize-none"
                placeholder="What did they say?"
              />
            </label>
            <button
              type="button"
              onClick={logCall}
              disabled={pending}
              className="neu-raised-sm px-4 py-2 t-body font-medium text-accent self-start disabled:opacity-40"
            >
              {pending ? "Logging…" : "Log call"}
            </button>
          </section>

          {/* Promote */}
          <section className="flex flex-col gap-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <UserPlus size={14} className="text-text-muted" />
              <div className="t-caption text-text-subtle uppercase tracking-wide">
                Promote to signed agent
              </div>
            </div>
            <p className="t-caption text-text-muted">
              Creates the agent as{" "}
              <span className="font-semibold">verbally_agreed</span> and
              adds them to this lead&apos;s picks. SMS consent is captured now
              per §8 (no consent, no SMS, no exceptions).
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="t-caption text-text-muted mb-1">
                SMS consent
              </legend>
              {CONSENT_OPTIONS.map((c) => (
                <label
                  key={c.key}
                  className="flex items-start gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="sms-consent"
                    value={c.key}
                    checked={smsConsent === c.key}
                    onChange={() => setSmsConsent(c.key)}
                    className="mt-1"
                  />
                  <span className="flex flex-col">
                    <span className="t-body">{c.label}</span>
                    <span className="t-caption text-text-subtle tabular">
                      {c.hint}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              onClick={promote}
              disabled={pending}
              className="btn-accent-glass self-start disabled:opacity-40"
            >
              <UserPlus size={14} />
              Promote
            </button>
          </section>

          {/* Dismiss */}
          <section className="flex flex-col gap-2 border-t pt-4">
            <div className="t-caption text-text-subtle uppercase tracking-wide">
              Dismiss
            </div>
            <p className="t-caption text-text-muted">
              Hides this candidate for this lead. Reason from the note
              above (if any) is stored on the audit row.
            </p>
            <button
              type="button"
              onClick={dismiss}
              disabled={pending}
              className="neu-raised-sm px-4 py-2 t-body font-medium text-danger self-start disabled:opacity-40"
            >
              Dismiss candidate
            </button>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function bannerFor(code: string): string {
  switch (code) {
    case "forbidden":
    case "unauthenticated":
    case "inactive":
      return "You can't do that.";
    case "not_found":
      return "Candidate no longer exists.";
    case "validation":
      return "Invalid input.";
    default:
      return "Save failed.";
  }
}
