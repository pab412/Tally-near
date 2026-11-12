import { describe, expect, it, vi } from "vitest";
import { HistoryError, INDEX, addsUp, cardHistory } from "@/lib/card-history";

const CARD = "card.sample.testnet";
const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const OTHER = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
/** A moment, as the index gives it: nanoseconds in a string. `n` seconds after a fixed start. */
const at = (n: number) => `${(1_794_000_000 + n) * 1000}000000`;
const AT = (n: number) => (1_794_000_000 + n) * 1000;

interface Fake {
  receipt_id: string;
  receiver_account_id: string;
  predecessor_account_id: string;
  transaction_hash: string;
  block: { block_timestamp: string };
  actions: { method: string; args: { deposit: string; args_json: object } }[];
  outcome: { status: boolean; result?: string };
  receipts: Fake[];
}
let n = 0;
/** One call of the card contract, as the index shows it inside a transaction. */
const call = (method: string, args: object, when: number, more: { deposit?: string; ok?: boolean; result?: unknown; to?: string } = {}): Fake => ({
  receipt_id: `receipt-${++n}`,
  receiver_account_id: more.to ?? CARD,
  predecessor_account_id: "check.sample.testnet",
  transaction_hash: `tx-${n}`,
  block: { block_timestamp: at(when) },
  actions: [{ method, args: { deposit: more.deposit ?? "0", args_json: args } }],
  outcome: { status: more.ok ?? true, result: more.result === undefined ? "" : btoa(JSON.stringify(more.result)) },
  receipts: [],
});

/** NearBlocks' index, faked: the card's mints and burns, and the contract's receipts by method. `cut` names lists that go on past one page. */
function index({ held = [] as object[], calls = [] as Fake[], cut = [] as string[], down = [] as string[] }) {
  const asked: string[] = [];
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url.replace(INDEX, ""));
    if (down.some((d) => url.includes(d))) return new Response("no", { status: 500 });
    const meta = (what: string) => ({ next_page: cut.includes(what) ? "more" : null });
    if (url.includes(`/nfts/${CARD}/tokens/`)) return Response.json({ data: url.includes(`/tokens/${FP}/`) ? held : [], meta: meta("held") });
    const method = /receipts\?method=(\w+)/.exec(url)?.[1];
    // a list row carries the method but not what the call said
    if (method) return Response.json({ data: calls.filter((c) => c.actions[0].method === method).map((c) => ({ ...c, actions: [{ method }], receipts: undefined })), meta: meta(method) });
    const tx = /\/txns\/([\w-]+)\/receipts/.exec(url)?.[1];
    const inside = calls.find((c) => c.transaction_hash === tx);
    // the call sits under the receipt that caused it, as a paid check's payment to a card does
    if (inside) return Response.json({ data: { receipt_id: `top-of-${tx}`, receiver_account_id: "check.sample.testnet", actions: [{ method: "check" }], receipts: [inside] } });
    return new Response("not found", { status: 404 });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, asked };
}
const read = (fake: ReturnType<typeof index>, fingerprint = FP) => cardHistory(fingerprint, { contractId: CARD, fetch: fake.fetch });

const mint = (account: string, when: number) => ({ cause: "MINT", affected_account_id: account, block_timestamp: at(when), transaction_hash: `mint-${when}` });
const burn = (account: string, when: number) => ({ cause: "BURN", affected_account_id: account, block_timestamp: at(when), transaction_hash: `burn-${when}` });

describe("a verified card's history", () => {
  it("lists what happened to the card, oldest first: minted, paid, paid out", async () => {
    const earned = [call("earn", { fingerprint: FP }, 20, { deposit: "5000" }), call("earn", { fingerprint: FP }, 30, { deposit: "5000" })];
    const paidOut = call("on_paid_out", { token_id: FP, amount: "7000" }, 40, { result: "7000" });
    const h = await read(index({ held: [mint("trader.testnet", 10)], calls: [paidOut, ...earned] }));
    expect(h.events).toEqual([
      { kind: "minted", atMs: AT(10), tx: "mint-10", account: "trader.testnet" },
      { kind: "earned", atMs: AT(20), tx: earned[0].transaction_hash, yocto: "5000", from: "check.sample.testnet" },
      { kind: "earned", atMs: AT(30), tx: earned[1].transaction_hash, yocto: "5000", from: "check.sample.testnet" },
      { kind: "paid_out", atMs: AT(40), tx: paidOut.transaction_hash, yocto: "7000" },
    ]);
    expect([h.earnedYocto, h.paidOutYocto, h.complete]).toEqual(["10000", "7000", true]);
    expect(h.holders).toEqual([{ account: "trader.testnet", fromMs: AT(10), toMs: null }]);
  });

  it("counts only this card's payments, though the contract's list holds every card's", async () => {
    const h = await read(index({ held: [mint("trader.testnet", 10)], calls: [call("earn", { fingerprint: OTHER }, 20, { deposit: "9000" }), call("earn", { fingerprint: FP }, 30, { deposit: "5000" })] }));
    expect(h.earnedYocto).toBe("5000");
  });

  it("leaves out a payment that failed, and a payout that never arrived", async () => {
    const failed = call("earn", { fingerprint: FP }, 20, { deposit: "5000", ok: false });
    const bounced = call("on_paid_out", { token_id: FP, amount: "5000" }, 30, { result: "0" });
    const h = await read(index({ held: [mint("trader.testnet", 10)], calls: [failed, bounced] }));
    expect(h.events.map((e) => e.kind)).toEqual(["minted"]);
    expect([h.earnedYocto, h.paidOutYocto]).toEqual(["0", "0"]);
  });

  it("only believes a call that reached the card contract itself", async () => {
    const elsewhere = call("earn", { fingerprint: FP }, 20, { deposit: "5000", to: "lookalike.testnet" });
    expect((await read(index({ calls: [elsewhere] }))).earnedYocto).toBe("0");
  });

  it("shows each account that held it, and when the card was burned", async () => {
    const recheck = call("recheck", { fingerprint: FP }, 49);
    const h = await read(index({ held: [burn("first.testnet", 50), mint("second.testnet", 60), mint("first.testnet", 10)], calls: [recheck, call("recheck", { fingerprint: OTHER }, 55)] }));
    expect(h.events.map((e) => e.kind)).toEqual(["minted", "rechecked", "burned", "minted"]);
    expect(h.holders).toEqual([
      { account: "first.testnet", fromMs: AT(10), toMs: AT(50) },
      { account: "second.testnet", fromMs: AT(60), toMs: null },
    ]);
  });

  it("has nothing for a card that never had a verified card", async () => {
    expect(await read(index({ calls: [call("earn", { fingerprint: OTHER }, 20, { deposit: "1" })] }))).toEqual({ events: [], holders: [], earnedYocto: "0", paidOutYocto: "0", complete: true });
  });

  it("says when a list was cut off, so a total is never passed off as the whole", async () => {
    for (const cut of ["held", "earn", "on_paid_out", "recheck"]) expect((await read(index({ held: [mint("t.testnet", 1)], cut: [cut] }))).complete, cut).toBe(false);
  });

  it("fails as a whole when the index can't be read, never with half a history", async () => {
    for (const down of ["/nfts/", "method=earn", "/txns/"]) {
      await expect(read(index({ held: [mint("t.testnet", 1)], calls: [call("earn", { fingerprint: FP }, 2, { deposit: "1" })], down: [down] })), down).rejects.toBeInstanceOf(HistoryError);
    }
  });

  it("asks the index about this card and this contract only, and sends nothing else", async () => {
    const fake = index({ held: [mint("t.testnet", 1)] });
    await read(fake);
    expect(fake.asked.sort()).toEqual([
      `/accounts/${CARD}/receipts?method=earn&limit=100`,
      `/accounts/${CARD}/receipts?method=on_paid_out&limit=100`,
      `/accounts/${CARD}/receipts?method=recheck&limit=100`,
      `/nfts/${CARD}/tokens/${FP}/txns?limit=100`,
    ]);
  });
});

describe("whether the history adds up", () => {
  const history = { events: [], holders: [], earnedYocto: "10000", paidOutYocto: "7000", complete: true };

  it("is yes when earned minus paid out is what the contract says the card holds", () => {
    expect([addsUp(history, "3000"), addsUp(history, "2999")]).toEqual([true, false]);
  });

  it("isn't judged for a history that was cut off or a card that was burned", () => {
    expect(addsUp({ ...history, complete: false }, "3000")).toBeNull();
    expect(addsUp({ ...history, events: [{ kind: "burned", atMs: 1, tx: "t", account: "a.testnet" }] }, "3000")).toBeNull();
  });
});
