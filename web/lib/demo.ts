// What the demo's two write routes (record a check, mint or recheck a verified card) share: they are switched off
// unless the server has a password, an account and a key; they only ever write to testnet; and each request needs
// the password and a real fingerprint before anything is signed. The key never reaches the browser or the repo.

import { createHash, timingSafeEqual } from "node:crypto";
import { isFingerprint } from "./fingerprint";

export interface DemoEnv {
  password?: string;
  account?: string;
  key?: string;
  contractId: string;
  rpcUrl: string;
}

export interface Fail {
  status: number;
  body: { error: string };
}

export const fail = (status: number, error: string): Fail => ({ status, body: { error } });

export function writesEnabled(env: Pick<DemoEnv, "password" | "account" | "key">): boolean {
  return Boolean(env.password && env.account && env.key);
}

function samePassword(given: string, expected: string): boolean {
  // Hash both first so the comparison takes the same time whatever the lengths.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

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
  if (!env.account!.endsWith(".testnet") || !env.contractId.endsWith(".testnet")) {
    return fail(503, "This demo only writes to NEAR testnet.");
  }
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof input.password !== "string" || !samePassword(input.password, env.password!)) {
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
