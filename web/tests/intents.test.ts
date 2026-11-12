import { describe, expect, it, vi } from "vitest";
import { ASSETS, GOOD_FOR_MS, ONE_CLICK, QuoteError, isFresh, isSolanaAddress, solQuote } from "@/lib/intents";

// made-up addresses in Solana's form: 32 bytes in base58
const TO = "4Nd1mYw4r6bYqA7sKf3J8cQ2pXh5vT9uLz6eWg1RbMnD";
const SYSTEM = "11111111111111111111111111111111";
const NOW = Date.UTC(2026, 10, 12, 6);
const oneClick = (quote: object | null, status = 201) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(quote ? { quote } : {}), { status }));
const good = { amountOutFormatted: "0.002210484", amountOutUsd: "0.183381752640", timeEstimate: 19 };

describe("a Solana address", () => {
  it("is base58 for exactly 32 bytes", () => {
    expect([isSolanaAddress(TO), isSolanaAddress(SYSTEM)]).toEqual([true, true]);
    for (const bad of ["", "not-an-address", "trader.near", TO.slice(0, 40), `${TO}1`, TO.replace("4", "0"), `0x${"ab".repeat(20)}`, "1".repeat(31), undefined, 7]) expect(isSolanaAddress(bad), String(bad)).toBe(false);
  });
});

describe("a quote for what a card holds", () => {
  it("shows what 1Click answers: the SOL, the dollars and how long", async () => {
    expect(await solQuote("55000000000000000000000", TO, { fetch: oneClick(good), now: NOW })).toEqual({ yocto: "55000000000000000000000", sol: "0.002210484", usd: "0.18", seconds: 19, atMs: NOW });
  });

  it("only ever asks for a price: a dry run, NEAR to SOL, at the address typed", async () => {
    const fetched = oneClick(good);
    await solQuote("55000000000000000000000", TO, { fetch: fetched, now: NOW });
    const [url, init] = fetched.mock.calls[0];
    expect(url).toBe(ONE_CLICK);
    expect(JSON.parse(init!.body as string)).toMatchObject({ dry: true, swapType: "EXACT_INPUT", originAsset: ASSETS.near, destinationAsset: ASSETS.sol, amount: "55000000000000000000000", recipient: TO, recipientType: "DESTINATION_CHAIN" });
    expect(new Headers(init!.headers).has("authorization"), "no key is sent").toBe(false);
  });

  it("refuses a bad Solana address and an empty card before anyone is asked", async () => {
    const fetched = oneClick(good);
    await expect(solQuote("55000000000000000000000", "not-an-address", { fetch: fetched })).rejects.toThrow("That isn't a Solana address.");
    for (const nothing of ["0", "", "-5", "1.5"]) await expect(solQuote(nothing, TO, { fetch: fetched })).rejects.toBeInstanceOf(QuoteError);
    expect(fetched).not.toHaveBeenCalled();
  });

  it("says so when the quote service is down or answers no quote, and never makes a number up", async () => {
    const tries = [oneClick(null, 400), oneClick(null), oneClick({ amountOutFormatted: "lots" }), vi.fn<typeof fetch>(async () => Promise.reject(new Error("offline")))];
    for (const doFetch of tries) await expect(solQuote("1", TO, { fetch: doFetch })).rejects.toBeInstanceOf(QuoteError);
  });

  it("is refused once it has expired: a quote over a minute old is not the price", () => {
    const quote = { atMs: NOW };
    expect([isFresh(quote, NOW), isFresh(quote, NOW + GOOD_FOR_MS - 1), isFresh(quote, NOW + GOOD_FOR_MS), isFresh(quote, NOW - 1)]).toEqual([true, true, false, false]);
  });
});
