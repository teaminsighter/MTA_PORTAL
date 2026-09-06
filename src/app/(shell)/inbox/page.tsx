export const dynamic = "force-dynamic";

import { Suspense } from "react";
import InboxClient from "./InboxClient";
import { listLeads } from "@/lib/repo/leads";

export default async function InboxPage() {
  const leads = await listLeads();
  return (
    <Suspense fallback={null}>
      <InboxClient initialLeads={leads} />
    </Suspense>
  );
}
