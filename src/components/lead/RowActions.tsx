"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Mail, MessageSquare, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RowActionHandlers {
  onCall: () => void;
  onSms: () => void;
  onEmail: () => void;
  onCombo?: () => void;
}

interface RowActionsProps extends RowActionHandlers {
  phone?: string;
  email?: string;
  compact?: boolean;
  /** Controlled open state. Omit for internal state (uncontrolled). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/*
 * Channel affordances shown on every agent + candidate row. The `▾`
 * opens a small menu of combos + copy helpers. The menu renders via
 * a portal to `document.body` because the shortlist column has
 * overflow-y-auto — a plain absolute-positioned popover would get
 * clipped by the scroll container.
 */
export function RowActions({
  onCall,
  onSms,
  onEmail,
  onCombo,
  phone,
  email,
  compact,
  open: openProp,
  onOpenChange,
}: RowActionsProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInternal;
  const setOpen = (next: boolean) => {
    if (!isControlled) setOpenInternal(next);
    onOpenChange?.(next);
  };
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      // right offset from viewport edge — mirror the trigger's right edge.
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      // Recompute position while the shortlist scrolls so the menu
      // tracks the trigger cleanly rather than floating in place.
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const btnBase =
    "neu-raised-sm h-8 rounded-neu-sm flex items-center gap-1.5 text-text-muted hover:text-text transition-colors";
  const pad = compact ? "px-2" : "px-2.5";

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onSms}
        title="Send SMS"
        aria-label="Send SMS"
        className={cn(btnBase, pad)}
      >
        <MessageSquare size={13} aria-hidden />
        <span className={cn("t-caption font-medium", compact && "sr-only")}>
          SMS
        </span>
      </button>
      <button
        type="button"
        onClick={onEmail}
        title="Send email"
        aria-label="Send email"
        className={cn(btnBase, pad)}
      >
        <Mail size={13} aria-hidden />
        <span className={cn("t-caption font-medium", compact && "sr-only")}>
          Email
        </span>
      </button>
      <button
        type="button"
        onClick={onCall}
        title="Call"
        aria-label="Call"
        className={cn(btnBase, pad, "text-accent")}
      >
        <Phone size={13} aria-hidden />
        <span className={cn("t-caption font-medium", compact && "sr-only")}>
          Call
        </span>
      </button>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More send options"
        className={cn(btnBase, "px-1.5")}
      >
        <ChevronDown
          size={13}
          aria-hidden
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos.top, right: pos.right }}
              className="fixed z-50 min-w-[220px] neu-raised p-1.5 flex flex-col gap-0.5 anim-fade-in"
            >
              {onCombo ? (
                <MenuItem
                  onClick={() => {
                    setOpen(false);
                    onCombo();
                  }}
                  label="Send SMS + Email"
                  hint="Recommended"
                  accent
                />
              ) : null}
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  onSms();
                }}
                label="Preview SMS templates"
              />
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  onEmail();
                }}
                label="Preview Email templates"
              />
              <div className="h-px bg-border-strong my-1" />
              {phone ? (
                <MenuItem
                  onClick={async () => {
                    setOpen(false);
                    try {
                      await navigator.clipboard.writeText(phone);
                    } catch {
                      /* ignore */
                    }
                  }}
                  label="Copy phone"
                  hint={phone}
                  muted
                />
              ) : null}
              {email ? (
                <MenuItem
                  onClick={async () => {
                    setOpen(false);
                    try {
                      await navigator.clipboard.writeText(email);
                    } catch {
                      /* ignore */
                    }
                  }}
                  label="Copy email"
                  hint={email}
                  muted
                />
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function MenuItem({
  label,
  hint,
  accent,
  muted,
  onClick,
}: {
  label: string;
  hint?: string;
  accent?: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-neu-sm text-left t-body hover:bg-neutral-bg transition-colors",
        accent && "text-accent font-semibold",
        muted && "text-text-muted"
      )}
    >
      <span>{label}</span>
      {hint ? (
        <span className="t-caption text-text-subtle tabular truncate max-w-[110px]">
          {hint}
        </span>
      ) : null}
    </button>
  );
}
