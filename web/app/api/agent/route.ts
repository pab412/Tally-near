import { handleAgent, limiter } from "@/lib/break-it";
import { answer, readBody } from "@/lib/demo";
import { CONTRACT_ID, RPC_URL, latestRecord } from "@/lib/near";

// the model is asked up to four times in one attempt
export const maxDuration = 60;

// six tries in ten minutes for one visitor, and 400 a day for everyone, on each running copy of the site
const limit = limiter({ perVisitor: 6, windowMs: 10 * 60_000, perDay: 400 });

/** The "try to break it" page's one route (lib/break-it.ts): a visitor's message to a real model, behind the guard. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const env = {
    key: process.env.NEARAI_API_KEY,
    model: process.env.NEARAI_MODEL,
    address: request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    sameSite: !origin || (URL.canParse(origin) && new URL(origin).host === request.headers.get("host")),
  };
  const read = (fingerprint: string) => latestRecord(fingerprint, { contractId: CONTRACT_ID, rpcUrl: RPC_URL });
  return answer(await handleAgent(await readBody(request), env, limit, read));
}
