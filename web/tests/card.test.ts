import { describe, expect, it, vi } from "vitest";
import { handleCard, type SignCard } from "@/lib/card";
import type { DemoEnv } from "@/lib/demo";
import { checkTerms, isTestnetAccount, toVerifiedCard, verifiedCard } from "@/lib/near";

const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const ENV: DemoEnv = {
  password: "sample-password",
  account: "attester.testnet",
  key: "ed25519:SAMPLEKEYNOTREAL",
  contractId: "card.attester.testnet",
  rpcUrl: "https://rpc.example",
  read: async () => null,
};
const mint = { password: "sample-password", fingerprint: FP, action: "mint", holder: "sample-trader.testnet" };
const CARD = { fingerprint: FP, holder: "sample-trader.testnet", mintedAtMs: 1, checkId: "sample-a1", holdsYocto: "0" };

const okSigner = () =>
  vi.fn<SignCard>(async (req) => (req.action === "mint" ? { txHash: "SAMPLEHASH", card: CARD } : { txHash: "SAMPLEHASH", stands: false }));

describe("verified card route", () => {
  it("mints to the holder with the server's card key", async () => {
    const sign = okSigner();
    const res = await handleCard(mint, ENV, sign);
    expect(res).toEqual({ status: 200, body: { txHash: "SAMPLEHASH", card: CARD } });
    expect(sign).toHaveBeenCalledWith({
      account: "attester.testnet",
      key: ENV.key,
      contractId: "card.attester.testnet",
      rpcUrl: ENV.rpcUrl,
      fingerprint: FP,
      action: "mint",
      holder: "sample-trader.testnet",
    });
  });

  it("asks the contract to recheck a card and says whether it still stands", async () => {
    const sign = okSigner();
    const res = await handleCard({ password: "sample-password", fingerprint: FP, action: "recheck" }, ENV, sign);
    expect(res).toEqual({ status: 200, body: { txHash: "SAMPLEHASH", stands: false } });
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({ action: "recheck", fingerprint: FP }));
  });

  it("passes the contract's refusal on in the contract's own words", async () => {
    const sign = vi.fn<SignCard>(async () => {
      throw new Error("Smart contract panicked: Only a card the proof registry says is Real can be verified");
    });
    const res = await handleCard(mint, ENV, sign);
    expect(res).toEqual({ status: 409, body: { error: "Only a card the proof registry says is Real can be verified" } });
  });

  it("hides any other failure's details and the key from the browser", async () => {
    const sign = vi.fn<SignCard>(async () => {
      throw new Error("signer ed25519:SAMPLEKEYNOTREAL rejected");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleCard(mint, ENV, sign);
    spy.mockRestore();
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("SAMPLEKEY");
  });

  it("is switched off without a card key, refuses mainnet, a wrong password and a bad fingerprint", async () => {
    const sign = okSigner();
    expect((await handleCard(mint, { ...ENV, key: undefined }, sign)).status).toBe(503);
    expect((await handleCard(mint, { ...ENV, contractId: "card.sample.near" }, sign)).status).toBe(503);
    expect((await handleCard({ ...mint, password: "guess" }, ENV, sign)).status).toBe(401);
    expect((await handleCard({ ...mint, fingerprint: "@sample_trader" }, ENV, sign)).status).toBe(422);
    expect(sign).not.toHaveBeenCalled();
  });

  it("only mints to a named testnet account, and only knows mint and recheck", async () => {
    const sign = okSigner();
    for (const holder of ["sample.near", "@sample_trader", "Sample.testnet", "testnet", "", undefined]) {
      expect((await handleCard({ ...mint, holder }, ENV, sign)).status).toBe(422);
    }
    expect((await handleCard({ ...mint, action: "burn" }, ENV, sign)).status).toBe(422);
    expect(sign).not.toHaveBeenCalled();
    expect(isTestnetAccount("sample-trader.testnet") && isTestnetAccount("card.sample_1.testnet")).toBe(true);
  });

  it("only mints a card the demo itself recorded, never one of Tally's own checks", async () => {
    const sign = okSigner();
    const tallys = { fingerprint: FP, latest: { verdict: "Real" as const, check_id: "tally-42", recorded_at_ms: 1 }, entries: 1 };
    expect((await handleCard(mint, { ...ENV, read: async () => tallys }, sign)).status).toBe(409);
    expect((await handleCard(mint, { ...ENV, read: async () => Promise.reject(new Error("down")) }, sign)).status).toBe(502);
    expect(sign).not.toHaveBeenCalled();
    // a recheck only ever burns a card the registry no longer backs, and anyone may ask for one
    expect((await handleCard({ ...mint, action: "recheck" }, { ...ENV, read: async () => tallys }, sign)).status).toBe(200);
  });
});

describe("reading a verified card", () => {
  const token = { token_id: FP, owner_id: "sample-trader.testnet", metadata: { issued_at: "1794348278858", extra: '{"check_id":"sample-a1","registry":"proof.sample.testnet","holds":"5000000000000000000000"}' } };

  it("asks the card contract for the fingerprint's token", async () => {
    const calls: unknown[] = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { params } = JSON.parse(String(init?.body));
      calls.push([params.account_id, params.method_name, JSON.parse(atob(params.args_base64))]);
      const bytes = Array.from(new TextEncoder().encode(JSON.stringify(token)));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "tally", result: { result: bytes, logs: [] } }));
    }) as unknown as typeof globalThis.fetch;
    const card = await verifiedCard(FP, { fetch, contractId: "card.sample.testnet" });
    expect(card).toEqual({ fingerprint: FP, holder: "sample-trader.testnet", mintedAtMs: 1794348278858, checkId: "sample-a1", holdsYocto: "5000000000000000000000" });
    expect(calls).toEqual([["card.sample.testnet", "nft_token", { token_id: FP }]]);
  });

  it("reads what a paid check costs from the paid check contract", async () => {
    const terms = { fee: "10000000000000000000000", trader_percent: 50, registry: "proof.sample.testnet", cards: "card.sample.testnet", checks: 7 };
    const calls: unknown[] = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { params } = JSON.parse(String(init?.body));
      calls.push([params.account_id, params.method_name]);
      return new Response(JSON.stringify({ result: { result: Array.from(new TextEncoder().encode(JSON.stringify(terms))) } }));
    }) as unknown as typeof globalThis.fetch;
    expect(await checkTerms({ fetch, contractId: "check.sample.testnet" })).toEqual(terms);
    expect(calls).toEqual([["check.sample.testnet", "terms"]]);
  });

  it("answers null when the card has none, and reads a token even if its extra isn't JSON", async () => {
    const none = vi.fn(async () => new Response(JSON.stringify({ result: { result: Array.from(new TextEncoder().encode("null")) } })));
    expect(await verifiedCard(FP, { fetch: none as unknown as typeof globalThis.fetch })).toBeNull();
    expect(toVerifiedCard({ token_id: FP, owner_id: "a.testnet", metadata: { extra: "not json" } })).toEqual({ fingerprint: FP, holder: "a.testnet", mintedAtMs: 0, checkId: "", holdsYocto: "0" });
    expect(toVerifiedCard({ token_id: FP, owner_id: "a.testnet", metadata: { extra: '{"holds":"lots"}' } }).holdsYocto, "an amount that isn't a number counts as nothing").toBe("0");
  });
});
