/*
 * Send-flow state model shared by LeadWorkspace, AgentRow and SendBar.
 *
 * The demo simulates the whole loop client-side with timers so the
 * animation reads like the real thing:
 *
 *   queued → sending → sent  (SMS + Email, in parallel per agent)
 *          → awaiting reply
 *          → yes | no        (parsed reply, demo picks mostly "yes")
 *
 * Real Postmark / TransmitSMS hookups replace the timers later; the
 * shapes here don't change.
 */

export type ChannelStatus = "idle" | "queued" | "sending" | "sent";
export type ReplyStatus = "none" | "awaiting" | "yes" | "no";

export interface AgentRowStatus {
  sms: ChannelStatus;
  email: ChannelStatus;
  reply: ReplyStatus;
}

export type SendPhase =
  | "idle"
  | "sending"
  | "awaiting"
  | "ready_vendor"
  | "vendor_sent";

export function derivePhase(
  statuses: Map<string, AgentRowStatus>,
  vendorSent: boolean
): SendPhase {
  if (vendorSent) return "vendor_sent";
  if (statuses.size === 0) return "idle";
  const arr = Array.from(statuses.values());
  if (arr.some((s) => s.reply === "yes")) return "ready_vendor";
  if (
    arr.every(
      (s) =>
        s.sms === "sent" && s.email === "sent" && s.reply !== "none"
    )
  ) {
    return "awaiting";
  }
  return "sending";
}

export function countAwaiting(
  statuses: Map<string, AgentRowStatus>
): number {
  return Array.from(statuses.values()).filter((s) => s.reply === "awaiting")
    .length;
}

export function countConfirmed(
  statuses: Map<string, AgentRowStatus>
): number {
  return Array.from(statuses.values()).filter((s) => s.reply === "yes").length;
}
