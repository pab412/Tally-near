// Server only: signs the demo's writes with the keys from the server's settings. Imported by the API routes, never
// by a page.

import { Account, JsonRpcProvider, KeyPairSigner, getTransactionLastResult, teraToGas, type KeyPairString } from "near-api-js";
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
