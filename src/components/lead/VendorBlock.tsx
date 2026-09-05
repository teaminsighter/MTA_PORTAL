import { Mail, Phone, User } from "lucide-react";
import type { Lead } from "@/lib/mock";

interface VendorBlockProps {
  lead: Lead;
}

export function VendorBlock({ lead }: VendorBlockProps) {
  return (
    <section className="neu-raised p-4 flex flex-col gap-3">
      <div>
        <div className="t-caption text-text-subtle uppercase tracking-wide">
          Vendor
        </div>
        <div className="t-section">{lead.vendor_name}</div>
      </div>
      <div className="flex flex-col gap-2 t-body">
        <a
          href={`tel:${lead.phone.replace(/\s+/g, "")}`}
          className="flex items-center gap-2 hover:text-accent"
        >
          <Phone size={14} className="text-text-muted" />
          <span className="tabular">{lead.phone}</span>
        </a>
        <a
          href={`mailto:${lead.email}`}
          className="flex items-center gap-2 hover:text-accent"
        >
          <Mail size={14} className="text-text-muted" />
          <span>{lead.email}</span>
        </a>
        <div className="flex items-center gap-2 text-text-muted">
          <User size={14} />
          <span>Ref {lead.id}</span>
        </div>
      </div>
    </section>
  );
}
