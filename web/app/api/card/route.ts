import { handleCard } from "@/lib/card";
import { answer, readBody } from "@/lib/demo";
import { CARD_CONTRACT_ID, RPC_URL, latestRecord } from "@/lib/near";
import { signCard } from "@/lib/sign";

export async function POST(request: Request) {
  const env = {
    password: process.env.RECORD_PASSWORD,
    account: process.env.NEAR_ATTESTER_ACCOUNT,
    key: process.env.NEAR_CARD_KEY, // a key that can only call mint and recheck on the card contract
    contractId: CARD_CONTRACT_ID,
    rpcUrl: RPC_URL,
    read: (fingerprint: string) => latestRecord(fingerprint), // the proof registry, not the card contract
  };
  return answer(await handleCard(await readBody(request), env, signCard));
}
