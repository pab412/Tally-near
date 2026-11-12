// What the demo's two write routes (record a check, mint or recheck a verified card) share: they are switched off
// unless the server has a password, an account and a key; they only ever write to testnet; and each request needs
// the password and a real fingerprint before anything is signed. The key never reaches the browser or the repo.

import { createHash, timingSafeEqual } from "node:crypto";
import { isFingerprint } from "./fingerprint";
import { GUESSES, type Guesses } from "./limit";
import { DEMO_RECORD_FP, type ProofRecord } from "./near";

/** Reads a card's latest record from the registry: null when it has none. */
export type ReadRecord = (fingerprint: string) => Promise<ProofRecord | null>;

export interface DemoEnv {
  password?: string;
  account?: string;
  key?: string;
  contractId: string;
  rpcUrl: string;
  /** the registry, asked before a write so the demo never writes over a card it must leave alone */
  read: ReadRecord;
  /** the visitor's address, for the cap on wrong passwords only */
  address: string;
  /** the count of wrong passwords: the site-wide one unless a test gives its own */
  guesses?: Guesses;
}

/** The registry the hosted site writes to. Its example cards are kept as they are; a copy run against its own registry may record anything. */
export const HOSTED_REGISTRY = "proof.notpab.testnet";

/**
 * Cards the site's own claims stand on: the demo's Fake card (the "try to break it" page's trader) and sample cards
 * A and B (EVIDENCE.md). On the hosted registry the demo never records over them, so its password can't change what
 * those pages show.
 */
export const KEPT_CARDS: ReadonlySet<string> = new Set([
  DEMO_RECORD_FP,
  "776b729a98a45576e4381c7732d4b0eafcbec4eecc114c79116d9a7002258dbe", // public/samples/sample-card-a.png
  "3171ca6c47b50b2218cc76275f573aa1670479e2ae2eada69c00f20236599e58", // public/samples/sample-card-b.png
]);

/**
 * Whether the demo may write about this card. The registry and the card contract act on a card's latest entry,
 * whoever wrote it, so a demo entry on top of one of Tally's own checks would change that card's verdict. The demo
 * only writes about cards whose latest entry is its own (`sample-`), or that have none. Null when it may. The registry
 * is read just before the write, so an entry Tally makes in the same second can still be missed: this is a check, not
 * a lock (THREAT-MODEL.md).
 */
export async function demoMayWrite(fingerprint: string, read: ReadRecord, keepExamples: boolean): Promise<Fail | null> {
  if (keepExamples && KEPT_CARDS.has(fingerprint)) {
    return fail(409, "This card is one of the site's own examples, so the demo leaves its record as it is. Record Sample C or a picture of your own.");
  }
  let record: ProofRecord | null;
  try {
    record = await read(fingerprint);
  } catch {
    return fail(502, "NEAR couldn't be asked about this card just now. Try again in a moment.");
  }
  if (record && !record.latest.check_id.startsWith("sample-")) {
    return fail(409, "Tally has checked this card itself, so the demo can't write about it.");
  }
  return null;
}

export interface Fail {
  status: number;
  body: { error: string };
}

export const fail = (status: number, error: string): Fail => ({ status, body: { error } });

export function writesEnabled(env: Pick<DemoEnv, "password" | "account" | "key">): boolean {
  return Boolean(env.password && env.account && env.key);
}

export function samePassword(given: string, expected: string): boolean {
  // Hash both first so the comparison takes the same time whatever the lengths.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** What a visitor who has guessed the password wrong too often is told, by every route that checks one. */
export const TOO_MANY_GUESSES = "Too many wrong passwords. Wait a few minutes and try again.";

/** Every write this site signs, the demo's and Tally's own, goes to testnet and nowhere else. */
export const onTestnet = (account: string, contractId: string) => account.endsWith(".testnet") && contractId.endsWith(".testnet");

/** Who signs, and where: what a signer needs besides the request itself. */
export interface Signer {
  account: string;
  key: string;
  contractId: string;
  rpcUrl: string;
}

export interface Admitted {
  input: Record<string, unknown>;
  fingerprint: string;
  signer: Signer;
}

/** Lets a write request in, or says why not. `off` is what to say when this copy of the page has no key. */
export function admit(body: unknown, env: DemoEnv, off: string): Admitted | Fail {
  if (!writesEnabled(env)) return fail(503, off);
  if (!onTestnet(env.account!, env.contractId)) return fail(503, "This demo only writes to NEAR testnet.");
  const guesses = env.guesses ?? GUESSES;
  if (guesses.blocked(env.address)) return fail(429, TOO_MANY_GUESSES);
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof input.password !== "string" || !samePassword(input.password, env.password!)) {
    guesses.missed(env.address);
    return fail(401, "Wrong password.");
  }
  if (!isFingerprint(input.fingerprint)) return fail(422, "That isn't a card fingerprint.");
  const signer = { account: env.account!, key: env.key!, contractId: env.contractId, rpcUrl: env.rpcUrl };
  return { input, fingerprint: input.fingerprint, signer };
}

export const refused = (x: Admitted | Fail): x is Fail => "status" in x;

/** A write NEAR didn't take. The reason is logged on the server only; never the key, never the details to the browser. */
export function notWritten(what: string, err: unknown): Fail {
  console.error(`${what} failed:`, err instanceof Error ? err.message : "unknown error");
  return fail(502, "That couldn't be written to NEAR. Try again in a moment.");
}

const MAX_BODY = 2_000;

/** A route's JSON body, or null when it is too long or isn't JSON. */
export async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A route's answer: never cached. */
export const answer = (result: { status: number; body: object }) =>
  Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
