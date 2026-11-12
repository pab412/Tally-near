// What a verified card holds, quoted as SOL on Solana through NEAR Intents (the 1Click API). A quote, never a payout:
// 1Click works with real assets on NEAR mainnet, and these badges are on testnet, so nothing can be sent. Every
// request is a dry run (`dry: true`), which asks for a price and creates no deposit address. The holder types the
// Solana address to quote for; nobody links a wallet and nothing typed is stored.
//
// The address, the fields and the asset ids are 1Click's own: POST /v0/quote, and GET /v0/tokens for the ids.

export const ONE_CLICK = "https://1click.chaindefuser.com/v0/quote";
/** NEAR and SOL as 1Click's token list names them. */
export const ASSETS = { near: "nep141:wrap.near", sol: "nep141:sol.omft.near" } as const;
/** How long a quote is shown as current. Prices move, so an older one has to be asked for again. */
export const GOOD_FOR_MS = 60_000;
/**
 * Where a refund would go. A dry run never takes a deposit, so nothing can ever be refunded: this is an address in
 * the form 1Click accepts, held by nobody.
 */
const NOBODY = "0".repeat(64);

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** A Solana address: base58 for exactly 32 bytes. */
export function isSolanaAddress(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let n = BigInt(0);
  for (const c of value) n = n * BigInt(58) + BigInt(ALPHABET.indexOf(c));
  let bytes = 0;
  for (; n > BigInt(0); n /= BigInt(256)) bytes++;
  // each leading "1" is a zero byte the number above doesn't carry
  return bytes + (/^1*/.exec(value)?.[0].length ?? 0) === 32;
}

export interface SolQuote {
  /** what was quoted, in yoctoNEAR */
  yocto: string;
  /** what would arrive, as 1Click words it ("0.002210484") and in dollars */
  sol: string;
  usd: string;
  /** about how long the swap would take, in seconds */
  seconds: number;
  atMs: number;
}

/** A quote couldn't be had. The message is safe to show as is. */
export class QuoteError extends Error {}

/** A live quote: what `yocto` yoctoNEAR would arrive as on Solana, at `recipient`. Nothing is sent. */
export async function solQuote(yocto: string, recipient: string, opts: { fetch?: typeof fetch; now?: number } = {}): Promise<SolQuote> {
  if (!/^[1-9]\d*$/.test(yocto)) throw new QuoteError("There is nothing to quote.");
  if (!isSolanaAddress(recipient)) throw new QuoteError("That isn't a Solana address.");
  const now = opts.now ?? Date.now();
  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(ONE_CLICK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dry: true,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: ASSETS.near,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: ASSETS.sol,
        amount: yocto,
        refundTo: NOBODY,
        refundType: "ORIGIN_CHAIN",
        recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(now + 3_600_000).toISOString(),
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new QuoteError("The quote service couldn't be reached. Try again in a moment.");
  }
  const quote = res.ok ? ((await res.json().catch(() => null)) as { quote?: { amountOutFormatted?: unknown; amountOutUsd?: unknown; timeEstimate?: unknown } } | null)?.quote : null;
  if (!quote || typeof quote.amountOutFormatted !== "string" || !/^\d+(\.\d+)?$/.test(quote.amountOutFormatted)) {
    throw new QuoteError("The quote service didn't give a quote. Try again in a moment.");
  }
  const usd = Number(quote.amountOutUsd);
  return {
    yocto,
    sol: quote.amountOutFormatted,
    usd: Number.isFinite(usd) ? usd.toFixed(2) : "",
    seconds: typeof quote.timeEstimate === "number" ? quote.timeEstimate : 0,
    atMs: now,
  };
}

/** Whether a quote is still new enough to show as the price. */
export const isFresh = (quote: Pick<SolQuote, "atMs">, now = Date.now()) => now >= quote.atMs && now - quote.atMs < GOOD_FOR_MS;
