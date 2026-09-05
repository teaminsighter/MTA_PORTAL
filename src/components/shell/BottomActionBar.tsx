"use client";

import type { ReactNode } from "react";

interface BottomActionBarProps {
  children: ReactNode;
}

/**
 * Mobile-only pinned bottom action bar. Neumorphic raised on the surface.
 */
export function BottomActionBar({ children }: BottomActionBarProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 px-3 pb-4 pt-2">
      <div className="neu-raised p-3 flex items-center gap-3">{children}</div>
    </div>
  );
}
