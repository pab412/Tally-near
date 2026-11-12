import { describe, expect, it, vi } from "vitest";
import { HistoryError, INDEX, addsUp, cardHistory, happenedIn, type Transaction } from "@/lib/card-history";

const CARD = "card.sample.testnet";
const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const OTHER = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
/** A moment, `n` seconds after a fixed start: as the index gives it (nanoseconds) and as the page shows it (ms). */
const at = (n: number) => (1_794_000_000 + n) * 1e9;
const AT = (n: number) => (1_794_000_000 + n) * 1000;
const b64 = (value: unknown) => btoa(JSON.stringify(value));

let n = 0;
type Tx = Transaction & { transaction: { hash: string } };
/** One call the card contract ran, as the index shows it inside a transaction. */
const call = (method: string, args: object, when: number, more: { deposit?: string; failed?: boolean; answered?: unknown; to?: string; logs?: string[] } = {}) => ({
  receipt: {
    receiver_id: more.to ?? CARD,
    predecessor_id: "check.sample.testnet",
    block_timestamp: at(when),
    receipt: { Action: { actions: [{ FunctionCall: { method_name: method, args: b64(args), deposit: more.deposit ?? "0" } }] } },
  },
  execution_outcome: { outcome: { logs: more.logs ?? [], status: more.failed ? { Failure: {} } : { SuccessValue: more.answered === undefined ? "" : b64(more.answered) } } },
});
/** A transaction holding those calls, under the call that caused them (as a paid check's payment to a card is). */
const tx = (...calls: ReturnType<typeof call>[]): Tx => ({
  transaction: { hash: `tx-${++n}` },
  receipts: [{ receipt: { receiver_id: "check.sample.testnet", predecessor_id: "agent.testnet", block_timestamp: at(0), receipt: { Action: { actions: [{ FunctionCall: { method_name: "check", args: b64({}) } }] } } }, execution_outcome: { outcome: { logs: [], status: { SuccessReceiptId: "next" } } } }, ...calls],
});
const event = (name: "nft_mint" | "nft_burn", owner: string, token = FP) => `EVENT_JSON:${JSON.stringify({ standard: "nep171", version: "1.0.0", event: name, data: [{ owner_id: owner, token_ids: [token] }] })}`;
const mint = (owner: string, when: number, token = FP) => tx(call("on_mint_checked", { fingerprint: token, owner }, when, { logs: [event("nft_mint", owner, token)] }));
const burn = (owner: string, when: number) => tx(call("on_rechecked", { fingerprint: FP }, when, { logs: [event("nft_burn", owner)] }));

/** FastNEAR's index, faked: the contract's transactions, newest first, and each one in full, twenty at a time. */
function index(txs: Tx[], { more = false, down = [] as string[], busyFirst = 0 } = {}) {
  const asked: { path: string; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace(INDEX, "");
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    asked.push({ path, body });
    if (down.includes(path) || asked.length <= busyFirst) return new Response("no", { status: 429 });
    if (path === "/account") return Response.json({ account_txs: [...txs].reverse().map((t) => ({ transaction_hash: t.transaction.hash })), resume_token: more ? "more" : null });
    const wanted = body.tx_hashes as string[];
    if (wanted.length > 20) return new Response("too many", { status: 400 });
    return Response.json({ transactions: txs.filter((t) => wanted.includes(t.transaction.hash)) });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, asked };
}
const read = (fake: ReturnType<typeof index>, fingerprint = FP, retryMs: number[] = []) => cardHistory(fingerprint, { contractId: CARD, fetch: fake.fetch, retryMs });

describe("a verified card's history", () => {
  it("lists what happened to the card, oldest first: minted, paid in, paid out", async () => {
    const txs = [mint("trader.testnet", 10), tx(call("earn", { fingerprint: FP }, 20, { deposit: "5000" })), tx(call("earn", { fingerprint: FP }, 30, { deposit: "5000" })), tx(call("on_paid_out", { token_id: FP, amount: "7000" }, 40, { answered: "7000" }))];
    const h = await read(index(txs));
    expect(h.events).toEqual([
      { kind: "minted", atMs: AT(10), tx: txs[0].transaction.hash, account: "trader.testnet" },
      { kind: "earned", atMs: AT(20), tx: txs[1].transaction.hash, yocto: "5000", from: "check.sample.testnet" },
      { kind: "earned", atMs: AT(30), tx: txs[2].transaction.hash, yocto: "5000", from: "check.sample.testnet" },
      { kind: "paid_out", atMs: AT(40), tx: txs[3].transaction.hash, yocto: "7000" },
    ]);
    expect([h.earnedYocto, h.paidOutYocto, h.complete]).toEqual(["10000", "7000", true]);
    expect(h.holders).toEqual([{ account: "trader.testnet", fromMs: AT(10), toMs: null }]);
  });

  it("counts only this card's, though the contract's transactions are every card's", async () => {
    const h = await read(index([mint("trader.testnet", 10), mint("someone.testnet", 11, OTHER), tx(call("earn", { fingerprint: OTHER }, 20, { deposit: "9000" })), tx(call("earn", { fingerprint: FP }, 30, { deposit: "5000" }))]));
    expect([h.earnedYocto, h.holders.map((x) => x.account)]).toEqual(["5000", ["trader.testnet"]]);
  });

  it("leaves out a payment that failed, and a payout that never arrived", async () => {
    const h = await read(index([mint("trader.testnet", 10), tx(call("earn", { fingerprint: FP }, 20, { deposit: "5000", failed: true })), tx(call("on_paid_out", { token_id: FP, amount: "5000" }, 30, { answered: "0" }))]));
    expect(h.events.map((e) => e.kind)).toEqual(["minted"]);
    expect([h.earnedYocto, h.paidOutYocto]).toEqual(["0", "0"]);
  });

  it("only believes what the card contract itself ran: a look-alike's calls and events are nothing", async () => {
    const elsewhere = { to: "lookalike.testnet" };
    const h = await read(index([tx(call("earn", { fingerprint: FP }, 20, { deposit: "5000", ...elsewhere }), call("on_mint_checked", {}, 21, { ...elsewhere, logs: [event("nft_mint", "faker.testnet")] }))]));
    expect(h).toMatchObject({ events: [], earnedYocto: "0", holders: [] });
  });

  it("shows each account that held it, when a recheck was asked for, and when it was burned", async () => {
    const h = await read(index([mint("first.testnet", 10), tx(call("recheck", { fingerprint: FP }, 49)), tx(call("recheck", { fingerprint: OTHER }, 49)), burn("first.testnet", 50), mint("second.testnet", 60)]));
    expect(h.events.map((e) => e.kind)).toEqual(["minted", "rechecked", "burned", "minted"]);
    expect(h.holders).toEqual([
      { account: "first.testnet", fromMs: AT(10), toMs: AT(50) },
      { account: "second.testnet", fromMs: AT(60), toMs: null },
    ]);
  });

  it("has nothing for a card that never had a verified card", async () => {
    expect(await read(index([tx(call("earn", { fingerprint: OTHER }, 20, { deposit: "1" }))]))).toEqual({ events: [], holders: [], earnedYocto: "0", paidOutYocto: "0", complete: true });
  });

  it("says when the contract has more transactions than were read, so a total is never passed off as the whole", async () => {
    expect((await read(index([mint("t.testnet", 1)], { more: true }))).complete).toBe(false);
  });

  it("fails as a whole when the index can't be read, never with half a history, and says why", async () => {
    for (const down of ["/account", "/transactions"]) {
      await expect(read(index([mint("t.testnet", 1)], { down: [down] })), down).rejects.toThrow(new HistoryError("the index answered 429"));
    }
  });

  it("asks for the contract's transactions once, then each in full twenty at a time, and reads none twice", async () => {
    const txs = Array.from({ length: 45 }, (_, i) => tx(call("earn", { fingerprint: FP }, i + 1, { deposit: "1" })));
    const fake = index(txs);
    expect((await read(fake)).earnedYocto).toBe("45");
    expect(fake.asked.map((a) => a.path)).toEqual(["/account", "/transactions", "/transactions", "/transactions"]);
    expect(fake.asked[0].body).toEqual({ account_id: CARD, limit: 200 });
    expect(fake.asked.slice(1).map((a) => (a.body.tx_hashes as string[]).length)).toEqual([20, 20, 5]);
    // what a transaction did never changes, and the list of them is shared for a moment: a second look asks nothing
    expect((await read(fake, OTHER)).events).toEqual([]);
    expect(fake.asked).toHaveLength(4);
  });

  it("shares one request for the list among pages opened at once, so a burst of visitors isn't refused by the index", async () => {
    const fake = index([mint("t.testnet", 1)]);
    await Promise.all(Array.from({ length: 30 }, () => read(fake)));
    expect(fake.asked.map((a) => a.path)).toEqual(["/account", "/transactions"]);
  });

  it("asks again when the index says it is busy, and gives up only after the last wait", async () => {
    const busy = index([mint("t.testnet", 1)], { busyFirst: 2 });
    expect((await read(busy, FP, [0, 0])).holders).toHaveLength(1);
    expect(busy.asked.map((a) => a.path)).toEqual(["/account", "/account", "/account", "/transactions"]);
    const tooBusy = index([mint("t.testnet", 1)], { busyFirst: 3 });
    await expect(read(tooBusy, FP, [0, 0])).rejects.toThrow(new HistoryError("the index answered 429"));
    // a failed answer is never kept: the next page asks afresh
    expect((await read(tooBusy, FP, [0, 0])).holders).toHaveLength(1);
  });
});

describe("what one transaction did", () => {
  it("is read from the call's own arguments, its deposit and the contract's answer", () => {
    const t = tx(call("earn", { fingerprint: FP }, 5, { deposit: "42" }), call("on_paid_out", { token_id: OTHER, amount: "9" }, 6, { answered: "9" }));
    expect(happenedIn(t, CARD)).toEqual([
      { kind: "earned", fingerprint: FP, atMs: AT(5), tx: t.transaction.hash, yocto: "42", from: "check.sample.testnet" },
      { kind: "paid_out", fingerprint: OTHER, atMs: AT(6), tx: t.transaction.hash, yocto: "9" },
    ]);
  });

  it("is nothing for a transaction that is empty, unreadable or about something else", () => {
    expect([happenedIn({}, CARD), happenedIn({ transaction: { hash: "t" } }, CARD), happenedIn(tx(call("nft_token", { token_id: FP }, 1, { logs: ["not an event", "EVENT_JSON:{broken"] })), CARD)]).toEqual([[], [], []]);
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
