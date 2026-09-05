import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const nzMoney = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  maximumFractionDigits: 0,
});

const nzMoneyCompact = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatMoneyNZ(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return nzMoney.format(value);
}

export function formatMoneyNZCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return nzMoneyCompact.format(value);
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

const rtf = new Intl.RelativeTimeFormat("en-NZ", { numeric: "auto" });

export function formatRelative(iso: string, nowMs = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const deltaSec = Math.round((then - nowMs) / 1000);
  const abs = Math.abs(deltaSec);
  for (const [unit, secs] of relativeUnits) {
    if (abs >= secs || unit === "second") {
      return rtf.format(Math.round(deltaSec / secs), unit);
    }
  }
  return "just now";
}

export function formatDateNZ(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
