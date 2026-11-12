// Limits: one for the routes that call someone else's service for a visitor (the "try to break it" page's model in
// lib/break-it.ts, the Solana quote in lib/intents.ts), and one on wrong passwords for the routes that sign.

import { createHash } from "node:crypto";

/** A visitor, as a one-way hash of their address. */
const visitor = (address: string) => createHash("sha256").update(address).digest("hex").slice(0, 16);

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
    const who = visitor(address);
    const times = (recent.get(who) ?? []).filter((t) => now - t < windowMs);
    if (times.length >= perVisitor) return "limited";
    recent.set(who, [...times, now]);
    used++;
    return "ok";
  };
}
export type Limit = ReturnType<typeof limiter>;

/**
 * A cap on wrong passwords, for the routes that sign with the server's key (the demo's record and card routes, and
 * Tally's attest route). Only wrong guesses count, so the owner typing the right password is never held up; once a
 * visitor has guessed wrong `perVisitor` times in `windowMs`, every try is refused, right or wrong, until the window
 * passes. In memory, per running copy of the site, like `limiter`.
 */
export function guessLimiter({ perVisitor, windowMs }: { perVisitor: number; windowMs: number }) {
  const wrong = new Map<string, number[]>();
  const recent = (who: string, now: number) => (wrong.get(who) ?? []).filter((t) => now - t < windowMs);
  return {
    blocked(address: string, now = Date.now()): boolean {
      return recent(visitor(address), now).length >= perVisitor;
    },
    missed(address: string, now = Date.now()): void {
      if (wrong.size > 10_000) wrong.clear();
      const who = visitor(address);
      wrong.set(who, [...recent(who, now), now]);
    },
  };
}
export type Guesses = ReturnType<typeof guessLimiter>;

/** One site-wide count of wrong passwords, shared by every route that checks one: 10 wrong in 10 minutes. */
export const GUESSES: Guesses = guessLimiter({ perVisitor: 10, windowMs: 10 * 60_000 });

/** The visitor's address as Vercel passes it, for the limits only. */
export const addressOf = (request: Request) =>
  request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
