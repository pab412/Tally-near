// Tally's own checks. Tally's server (tallypnl.com), not a visitor, sends a card's fingerprint, the verdict and Tally's
// id for the check, with a secret only the two servers hold. It is signed with the same attester key as the demo's
// records, so the contract sees one attester. Nothing but those three things is sent: no name, no handle, no picture.
//
// Two things keep real records apart from the demo's and tidy:
//   - a check id starting "sample-" is the demo's mark and is refused here, so a real record can't pass for a sample
//     or a sample for a real one;
//   - a request that arrives twice (Tally retries when it hears nothing back) writes once: the registry is asked
//     first, and an entry that is already the card's latest is answered without signing anything.

import { TOO_MANY_GUESSES, fail, notWritten, onTestnet, samePassword, type Fail } from "./demo";
import { GUESSES, type Guesses } from "./limit";
import { isFingerprint } from "./fingerprint";
import { VERDICTS, type ProofRecord, type Verdict } from "./near";
import type { Sign } from "./record";

export interface AttestEnv {
  secret?: string;
  account?: string;
  key?: string;
  contractId: string;
  rpcUrl: string;
  /** the caller's address, for the cap on wrong secrets only */
  address: string;
  /** the count of wrong secrets: the site-wide one unless a test gives its own */
  guesses?: Guesses;
}

/** `txHash` is null when the entry was already on record and nothing was written. */
export type AttestResult = { status: 200; body: { record: ProofRecord; txHash: string | null } } | Fail;

/** A card's record as the registry holds it now, or null when it has none. */
export type Latest = (fingerprint: string) => Promise<ProofRecord | null>;

/** What the contract takes as a check id: 1 to 32 lower-case letters, digits, - or _. */
const CHECK_ID = /^[a-z0-9_-]{1,32}$/;
export const SAMPLE_MARK = "sample-";

export async function handleAttest(body: unknown, bearer: string | null, env: AttestEnv, sign: Sign, latest: Latest): Promise<AttestResult> {
  if (!env.secret || !env.account || !env.key) return fail(503, "Tally's own checks are switched off on this copy of the page.");
  if (!onTestnet(env.account, env.contractId)) return fail(503, "This site only writes to NEAR testnet.");
  const guesses = env.guesses ?? GUESSES;
  if (guesses.blocked(env.address)) return fail(429, TOO_MANY_GUESSES);
  if (!bearer || !samePassword(bearer, env.secret)) {
    guesses.missed(env.address);
    return fail(401, "Not allowed.");
  }

  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const { fingerprint, verdict, check_id: checkId } = input;
  if (!isFingerprint(fingerprint)) return fail(422, "That isn't a card fingerprint.");
  if (!VERDICTS.includes(verdict as Verdict)) return fail(422, "The verdict is Real, Unclear or Fake.");
  if (typeof checkId !== "string" || !CHECK_ID.test(checkId) || checkId.startsWith(SAMPLE_MARK)) {
    return fail(422, "A check id is 1 to 32 lower-case letters, digits, - or _, and never starts with sample-.");
  }

  try {
    const held = await latest(fingerprint);
    if (held && held.latest.verdict === verdict && held.latest.check_id === checkId) return { status: 200, body: { record: held, txHash: null } };
    const signer = { account: env.account, key: env.key, contractId: env.contractId, rpcUrl: env.rpcUrl };
    return { status: 200, body: await sign({ ...signer, fingerprint, verdict: verdict as Verdict, checkId }) };
  } catch (err) {
    return notWritten("attest", err);
  }
}
