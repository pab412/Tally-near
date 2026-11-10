// Server only: signs the `record` call with the attester key. Imported by the API route, never by a page.

import { Account, JsonRpcProvider, KeyPairSigner, getTransactionLastResult, teraToGas, type KeyPairString } from "near-api-js";
import type { ProofRecord } from "./near";
import type { Sign } from "./record";

export const signWithNear: Sign = async ({ account, key, contractId, rpcUrl, fingerprint, verdict, checkId }) => {
  const signer = KeyPairSigner.fromSecretKey(key as KeyPairString);
  const caller = new Account(account, new JsonRpcProvider({ url: rpcUrl }), signer);
  const outcome = await caller.callFunctionRaw({
    contractId,
    methodName: "record",
    args: { fingerprint, verdict, check_id: checkId },
    gas: teraToGas(30),
  });
  return { record: getTransactionLastResult(outcome) as ProofRecord, txHash: outcome.transaction.hash };
};
