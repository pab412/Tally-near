import { handleAttest } from "@/lib/attest";
import { answer, readBody } from "@/lib/demo";
import { CONTRACT_ID, RPC_URL, latestRecord } from "@/lib/near";
import { signWithNear } from "@/lib/sign";

/** Tally's own checks, from Tally's server to the registry (lib/attest.ts). Not for visitors: it needs Tally's secret. */
export async function POST(request: Request) {
  const env = {
    secret: process.env.TALLY_ATTEST_SECRET,
    account: process.env.NEAR_ATTESTER_ACCOUNT,
    key: process.env.NEAR_ATTESTER_KEY,
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
  };
  const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  const latest = (fingerprint: string) => latestRecord(fingerprint, { contractId: CONTRACT_ID, rpcUrl: RPC_URL });
  return answer(await handleAttest(await readBody(request), bearer, env, signWithNear, latest));
}
