import { CONTRACT_ID, RPC_URL } from "@/lib/near";
import { handleRecord } from "@/lib/record";
import { signWithNear } from "@/lib/sign";

const MAX_BODY = 2_000;

export async function POST(request: Request) {
  const text = await request.text();
  let body: unknown = null;
  if (text.length <= MAX_BODY) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  const result = await handleRecord(
    body,
    {
      password: process.env.RECORD_PASSWORD,
      account: process.env.NEAR_ATTESTER_ACCOUNT,
      key: process.env.NEAR_ATTESTER_KEY,
      contractId: CONTRACT_ID,
      rpcUrl: RPC_URL,
    },
    signWithNear,
  );
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
