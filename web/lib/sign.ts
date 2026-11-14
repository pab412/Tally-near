// Server only: signs the demo's writes with the keys from the server's settings. Imported by the API routes, never
// by a page.

import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, getTransactionLastResult, teraToGas, type KeyPairString } from "near-api-js";
import type { SignCard } from "./card";
import type { Signer } from "./demo";
import { toVerifiedCard, type NftToken, type ProofRecord } from "./near";
import type { Sign } from "./record";

const GAS = teraToGas(30); // a mint with its call to the registry burns under 7

async function call({ account, key, contractId, rpcUrl }: Signer, methodName: string, args: object) {
  const caller = new Account(account, new JsonRpcProvider({ url: rpcUrl }), KeyPairSigner.fromSecretKey(key as KeyPairString));
  const outcome = await caller.callFunctionRaw({ contractId, methodName, args, gas: GAS });
  return { result: getTransactionLastResult(outcome), txHash: outcome.transaction.hash };
}

export const signWithNear: Sign = async ({ fingerprint, verdict, checkId, ...signer }) => {
  const { result, txHash } = await call(signer, "record", { fingerprint, verdict, check_id: checkId });
  return { record: result as ProofRecord, txHash };
};

export const signCard: SignCard = async (request) => {
  if (request.action === "mint") {
    const { result, txHash } = await call(request, "mint", { fingerprint: request.fingerprint, owner: request.holder });
    return { txHash, card: toVerifiedCard(result as NftToken) };
  }
  const { result, txHash } = await call(request, "recheck", { fingerprint: request.fingerprint });
  return { txHash, stands: (result as unknown) === true };
};

/** What NEAR lets the site's key do: what anyone can read on the chain about it. */
export type KeyOnNear = "can record" | "not on the account" | "can't call record on the registry" | "not a NEAR key" | "NEAR not read";

export interface SignerSetup {
  account: string | null;
  /** the public half of the key the site signs with (never the key itself) */
  publicKey: string | null;
  onNear: KeyOnNear | null;
  /** NEAR left of a function-call key's gas allowance; null for a key without one */
  allowance: number | null;
}

/**
 * Whether the site's key can sign Tally's checks, from what anyone can read on NEAR: the public half of the key, and
 * whether the account holds that key with leave to call `record` on the registry. A key taken off the account, or a
 * key for another contract, fails every write, and this says which. Never the key or anything secret.
 */
export async function signerSetup(o: { account?: string; key?: string; contractId: string; rpcUrl: string; fetch?: typeof fetch }): Promise<SignerSetup> {
  const none = { account: o.account ?? null, publicKey: null, allowance: null };
  if (!o.account || !o.key) return { ...none, onNear: null };
  let publicKey: string;
  try {
    publicKey = KeyPair.fromString(o.key as KeyPairString).getPublicKey().toString();
  } catch {
    return { ...none, onNear: "not a NEAR key" };
  }
  const known = { account: o.account, publicKey, allowance: null };
  try {
    const res = await (o.fetch ?? fetch)(o.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "tally", method: "query", params: { request_type: "view_access_key", finality: "final", account_id: o.account, public_key: publicKey } }),
    });
    const body = (await res.json()) as { error?: unknown; result?: { error?: unknown; permission?: unknown } };
    // a key the account doesn't hold: the node says so in place of the key's permission
    if (body.error || body.result?.error) return { ...known, onNear: "not on the account" };
    const permission = body.result?.permission;
    if (permission === "FullAccess") return { ...known, onNear: "can record" };
    const call = (permission as { FunctionCall?: { allowance?: string | null; receiver_id?: string; method_names?: string[] } } | undefined)?.FunctionCall;
    if (!call) return { ...known, onNear: "NEAR not read" };
    const allowance = call.allowance ? Number(BigInt(call.allowance) / BigInt("1000000000000000000")) / 1e6 : null; // yoctoNEAR to NEAR
    const records = call.receiver_id === o.contractId && (!call.method_names?.length || call.method_names.includes("record"));
    return { ...known, allowance, onNear: records ? "can record" : "can't call record on the registry" };
  } catch {
    return { ...known, onNear: "NEAR not read" };
  }
}
