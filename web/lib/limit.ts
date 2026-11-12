// A limit for the routes that call someone else's service for a visitor: the "try to break it" page's model
// (lib/break-it.ts) and the Solana quote (lib/intents.ts).

import { createHash } from "node:crypto";

/**
 * How many tries are let through. Counted in memory by each running copy of the site, so nothing about a visitor is
 * written anywhere; a visitor is a one-way hash of their address.
 */
export function limiter({ perVisitor, windowMs, perDay }: { perVisitor: number; windowMs: number; perDay: number }) {
  const recent = new Map<string, number[]>();
  let day = "";
  let used = 0;
  return (address: string, now = Date.now()): "ok" | "limited" | "full" => {
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      used = 0;
      recent.clear();
    }
    if (used >= perDay) return "full";
    const who = createHash("sha256").update(address).digest("hex").slice(0, 16);
    const times = (recent.get(who) ?? []).filter((t) => now - t < windowMs);
    if (times.length >= perVisitor) return "limited";
    recent.set(who, [...times, now]);
    used++;
    return "ok";
  };
}
export type Limit = ReturnType<typeof limiter>;
