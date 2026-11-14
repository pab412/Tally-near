import { handleAttest } from "@/lib/attest";
import { answer, readBody } from "@/lib/demo";
import { addressOf } from "@/lib/limit";
import { CONTRACT_ID, RPC_URL, latestRecord } from "@/lib/near";
import { signWithNear, signerSetup, type SignerSetup } from "@/lib/sign";
import { setting } from "@/lib/settings";

/** Tally's own checks, from Tally's server to the registry (lib/attest.ts). Not for visitors: it needs Tally's secret. */
export async function POST(request: Request) {
  const env = {
    secret: setting("TALLY_ATTEST_SECRET"),
    account: setting("NEAR_ATTESTER_ACCOUNT"),
    key: setting("NEAR_ATTESTER_KEY"),
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    address: addressOf(request),
  };
  const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  const latest = (fingerprint: string) => latestRecord(fingerprint, { contractId: CONTRACT_ID, rpcUrl: RPC_URL });
  return answer(await handleAttest(await readBody(request), bearer, env, signWithNear, latest));
}

let seen: { at: number; setup: SignerSetup & { on: boolean } } | null = null;

/**
 * Anyone can ask whether Tally's checks can be written: whether the three settings are there, and what NEAR says of
 * the key (the public half of it, whether it may call `record`, and its gas allowance left). Read once a minute at most.
 */
export async function GET() {
  if (!seen || Date.now() - seen.at > 60_000) {
    const setup = await signerSetup({ account: setting("NEAR_ATTESTER_ACCOUNT"), key: setting("NEAR_ATTESTER_KEY"), contractId: CONTRACT_ID, rpcUrl: RPC_URL });
    seen = { at: Date.now(), setup: { on: Boolean(setting("TALLY_ATTEST_SECRET") && setup.publicKey), ...setup } };
  }
  return Response.json(seen.setup, { headers: { "Cache-Control": "no-store" } });
}
