import { answer } from "@/lib/demo";
import { isFingerprint } from "@/lib/fingerprint";
import { QuoteError, isSolanaAddress, solQuote } from "@/lib/intents";
import { addressOf, limiter } from "@/lib/limit";
import { latestRecord, verifiedCard } from "@/lib/near";

// twenty quotes in ten minutes for one visitor, and 2,000 a day for everyone, on each running copy of the site
const limit = limiter({ perVisitor: 20, windowMs: 10 * 60_000, perDay: 2_000 });

/**
 * What a verified card holds, quoted as SOL at a Solana address (lib/intents.ts). The amount is read from the card
 * contract here, never taken from the request, and nothing is sent anywhere: it is a quote.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fingerprint = searchParams.get("fp");
  const to = searchParams.get("to");
  if (!isFingerprint(fingerprint)) return answer({ status: 422, body: { error: "That isn't a card fingerprint." } });
  if (!isSolanaAddress(to)) return answer({ status: 422, body: { error: "That isn't a Solana address." } });
  const address = addressOf(request);
  if (limit(address) !== "ok") return answer({ status: 429, body: { error: "That's a lot of quotes. Wait a few minutes and try again." } });
  try {
    const held = await verifiedCard(fingerprint);
    if (!held || held.holdsYocto === "0") return answer({ status: 404, body: { error: "This card holds nothing to quote." } });
    // the contract only pays out a card the registry still says is Real: a corrected one is burned instead
    if ((await latestRecord(fingerprint))?.latest.verdict !== "Real") {
      return answer({ status: 409, body: { error: "NEAR no longer says this card is Real, so what it holds can't be paid out." } });
    }
    return answer({ status: 200, body: await solQuote(held.holdsYocto, to) });
  } catch (err) {
    return answer({ status: 502, body: { error: err instanceof QuoteError ? err.message : "The card contract couldn't be read. Try again in a moment." } });
  }
}
