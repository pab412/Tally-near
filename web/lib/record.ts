// The "Record a check" demo. The browser sends a fingerprint, a verdict and the demo password; the server checks
// all three and signs with the attester key from its environment. The key never reaches the browser or the repo.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isFingerprint } from "./fingerprint";
import { VERDICTS, type ProofRecord, type Verdict } from "./near";

export interface RecordEnv {
  password?: string;
  account?: string;
  key?: string;
  contractId: string;
  rpcUrl: string;
}

export interface SignRequest {
  account: string;
  key: string;
  contractId: string;
  rpcUrl: string;
  fingerprint: string;
  verdict: Verdict;
  checkId: string;
}

export type Sign = (req: SignRequest) => Promise<{ record: ProofRecord; txHash: string }>;

export interface RecordResult {
  status: number;
  body: { record: ProofRecord; txHash: string } | { error: string };
}

export function recordingEnabled(env: Pick<RecordEnv, "password" | "account" | "key">): boolean {
  return Boolean(env.password && env.account && env.key);
}

/** Demo check ids are marked as samples: "sample-" plus 8 random letters and digits. */
export function newCheckId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "sample-" + Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

function samePassword(given: string, expected: string): boolean {
  // Hash both first so the comparison takes the same time whatever the lengths.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const fail = (status: number, error: string): RecordResult => ({ status, body: { error } });

export async function handleRecord(
  body: unknown,
  env: RecordEnv,
  sign: Sign,
  checkId: () => string = newCheckId,
): Promise<RecordResult> {
  if (!recordingEnabled(env)) return fail(503, "Recording is switched off on this copy of the page.");
  if (!env.account!.endsWith(".testnet") || !env.contractId.endsWith(".testnet")) {
    return fail(503, "This demo only records on NEAR testnet.");
  }

  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof input.password !== "string" || !samePassword(input.password, env.password!)) {
    return fail(401, "Wrong password.");
  }
  if (!isFingerprint(input.fingerprint)) return fail(422, "That isn't a card fingerprint.");
  if (!VERDICTS.includes(input.verdict as Verdict)) return fail(422, "Pick Real, Unclear or Fake.");

  try {
    const out = await sign({
      account: env.account!,
      key: env.key!,
      contractId: env.contractId,
      rpcUrl: env.rpcUrl,
      fingerprint: input.fingerprint,
      verdict: input.verdict as Verdict,
      checkId: checkId(),
    });
    return { status: 200, body: out };
  } catch (err) {
    // Log the reason on the server only; never the key, never the details to the browser.
    console.error("record failed:", err instanceof Error ? err.message : "unknown error");
    return fail(502, "The record couldn't be written to NEAR. Try again in a moment.");
  }
}
