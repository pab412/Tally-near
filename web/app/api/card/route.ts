import { handleCard } from "@/lib/card";
import { answer, readBody } from "@/lib/demo";
import { addressOf } from "@/lib/limit";
import { CARD_CONTRACT_ID, RPC_URL, latestRecord } from "@/lib/near";
import { signCard } from "@/lib/sign";
import { setting } from "@/lib/settings";

export async function POST(request: Request) {
  const env = {
    password: setting("RECORD_PASSWORD"),
    account: setting("NEAR_ATTESTER_ACCOUNT"),
    key: setting("NEAR_CARD_KEY"), // a key that can only call mint and recheck on the card contract
    contractId: CARD_CONTRACT_ID,
    rpcUrl: RPC_URL,
    address: addressOf(request),
    read: (fingerprint: string) => latestRecord(fingerprint), // the proof registry, not the card contract
  };
  return answer(await handleCard(await readBody(request), env, signCard));
}
