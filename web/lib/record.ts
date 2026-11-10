// The "Record a check" demo. The browser sends a fingerprint, a verdict and the demo password; the server checks
// all three and signs with the attester key from its environment. The key never reaches the browser or the repo.

import { randomBytes } from "node:crypto";
import { admit, fail, notWritten, refused, type DemoEnv, type Fail, type Signer } from "./demo";
import { VERDICTS, type ProofRecord, type Verdict } from "./near";

export interface SignRequest extends Signer {
  fingerprint: string;
  verdict: Verdict;
  checkId: string;
}

export type Sign = (req: SignRequest) => Promise<{ record: ProofRecord; txHash: string }>;

export type RecordResult = { status: 200; body: { record: ProofRecord; txHash: string } } | Fail;

/** Demo check ids are marked as samples: "sample-" plus 8 random letters and digits. */
export function newCheckId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "sample-" + Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

export async function handleRecord(
  body: unknown,
  env: DemoEnv,
  sign: Sign,
  checkId: () => string = newCheckId,
): Promise<RecordResult> {
  const admitted = admit(body, env, "Recording is switched off on this copy of the page.");
  if (refused(admitted)) return admitted;
  const { input, fingerprint, signer } = admitted;
  if (!VERDICTS.includes(input.verdict as Verdict)) return fail(422, "Pick Real, Unclear or Fake.");

  try {
    return { status: 200, body: await sign({ ...signer, fingerprint, verdict: input.verdict as Verdict, checkId: checkId() }) };
  } catch (err) {
    return notWritten("record", err);
  }
}
