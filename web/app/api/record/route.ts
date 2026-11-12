import { answer, readBody } from "@/lib/demo";
import { CONTRACT_ID, RPC_URL, latestRecord } from "@/lib/near";
import { handleRecord } from "@/lib/record";
import { signWithNear } from "@/lib/sign";

export async function POST(request: Request) {
  const env = {
    password: process.env.RECORD_PASSWORD,
    account: process.env.NEAR_ATTESTER_ACCOUNT,
    key: process.env.NEAR_ATTESTER_KEY,
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    read: (fingerprint: string) => latestRecord(fingerprint),
  };
  return answer(await handleRecord(await readBody(request), env, signWithNear));
}
