"use client";

import { useState, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface RightRailProps {
  children: ReactNode;
  /**
   * When collapsed, the rail becomes a slim vertical bar with only a toggle.
   * Callers should also adjust their grid column span to give the extra
   * horizontal space to the centre column — see LeadWorkspace.
   */
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function RightRail({ children, onCollapsedChange }: RightRailProps) {
  const [collapsed, setCollapsed] = useState(false);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      onCollapsedChange?.(next);
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex flex-col gap-4 transition-[width] duration-200",
        collapsed && "md:items-center"
      )}
      aria-label="Vendor and activity"
    >
      <div
        className={cn(
          "flex items-center gap-2",
          collapsed ? "md:justify-center" : "justify-between"
        )}
      >
        {collapsed ? null : (
          <span className="t-caption text-text-subtle uppercase tracking-wide">
            Vendor & activity
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand right rail" : "Collapse right rail"}
          aria-expanded={!collapsed}
          className="neu-raised-sm h-8 w-8 flex items-center justify-center text-text-muted"
        >
          {collapsed ? (
            <PanelRightOpen size={14} />
          ) : (
            <PanelRightClose size={14} />
          )}
        </button>
      </div>

      {collapsed ? null : (
        <div className="flex flex-col gap-4 anim-enter">{children}</div>
      )}
    </aside>
  );
}
