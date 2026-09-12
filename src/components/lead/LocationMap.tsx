"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";

/*
 * Location map for the property report.
 *
 * Client-side geocodes the property address via Nominatim (OSM's free
 * geocoding endpoint) then renders an OpenStreetMap iframe with a
 * marker at the resolved point. TanStack Query caches the geocode
 * indefinitely — a given address never moves — so switching leads
 * and coming back is instant.
 *
 * Falls back to a stylized placeholder while loading and if Nominatim
 * can't resolve the address (which happens for placeholder / demo
 * addresses that don't exist in the OSM index).
 */

interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
}

async function geocode(address: string): Promise<GeocodeResult | null> {
  // Nominatim is rate-limited to ~1 req/sec per IP. staleTime:Infinity
  // on the query means we hit it at most once per address.
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    address
  )}&format=json&limit=1&countrycodes=nz`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en-NZ,en" },
  });
  if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
  const data: GeocodeResult[] = await res.json();
  return data[0] ?? null;
}

interface Props {
  address: string;
  suburb: string | null;
}

export function LocationMap({ address, suburb }: Props) {
  const query = useQuery({
    queryKey: ["geocode", address],
    queryFn: () => geocode(address),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  if (query.data) {
    const lat = parseFloat(query.data.lat);
    const lon = parseFloat(query.data.lon);
    // ~0.006° longitude ≈ 500m at NZ latitudes; keep the frame tight
    // enough to feel local but not so tight that context is lost.
    const west = lon - 0.006;
    const east = lon + 0.006;
    const south = lat - 0.004;
    const north = lat + 0.004;
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${lat}%2C${lon}`;
    const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
    return (
      <div className="relative w-full aspect-[16/9] overflow-hidden rounded-neu bg-surface-elevated">
        <iframe
          key={src}
          src={src}
          title={`Map of ${address}`}
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <a
          href={link}
          target="_blank"
          rel="noreferrer noopener"
          className="absolute bottom-1 right-1 chip chip-neutral text-[10px] bg-white/90 backdrop-blur-sm hover:text-accent"
        >
          Open larger ↗
        </a>
      </div>
    );
  }

  // Loading or geocode miss: stylized placeholder (matches the old
  // decorative tile so the fallback doesn't feel like an error).
  return <StylizedPlaceholder suburb={suburb} loading={query.isPending} />;
}

function StylizedPlaceholder({
  suburb,
  loading,
}: {
  suburb: string | null;
  loading: boolean;
}) {
  return (
    <div
      className="relative w-full aspect-[16/9] flex items-center justify-center overflow-hidden rounded-neu"
      style={{
        background: "linear-gradient(135deg, #E8ECF2 0%, #F5F7FA 100%)",
      }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(0deg, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        className="absolute"
        style={{
          width: 260,
          height: 12,
          top: "52%",
          left: "18%",
          background:
            "linear-gradient(90deg, rgba(255,122,0,0.0), rgba(255,122,0,0.6), rgba(255,122,0,0.0))",
          borderRadius: 6,
          transform: "rotate(-8deg)",
        }}
      />
      <div
        className="absolute"
        style={{
          width: 180,
          height: 8,
          top: "38%",
          left: "45%",
          background:
            "linear-gradient(90deg, rgba(51,102,255,0.0), rgba(51,102,255,0.55), rgba(51,102,255,0.0))",
          borderRadius: 4,
          transform: "rotate(14deg)",
        }}
      />
      <div className="relative flex flex-col items-center gap-1">
        <span
          className="relative flex h-9 w-9 items-center justify-center rounded-neu-pill text-on-accent shadow-lg anim-call-ring"
          style={{ background: "var(--accent-gradient)" }}
        >
          <MapPin size={16} />
        </span>
        <span className="t-caption font-semibold text-text bg-white/85 px-2 py-0.5 rounded-neu-sm">
          {loading ? "Locating…" : suburb ?? "Location unavailable"}
        </span>
      </div>
    </div>
  );
}
