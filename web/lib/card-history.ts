// A verified card's history: who has held it, what it earned, what was paid out and when a recheck was asked for.
//
// The card contract keeps what a card holds now, not how it got there. The history is the contract's own receipts on
// NEAR: every mint, burn, payment in (`earn`), payout (`on_paid_out`) and recheck is a call anyone can see. NEAR's
// nodes answer for one transaction at a time, so the list comes from FastNEAR's public index of testnet
// (tx.test.fastnear.com, the same provider as the NEAR node this site reads; no key). Nothing here is written by
// Tally, and nothing is stored by this site.
//
// The index lists the contract's transactions for every card, so they are read through to find this card's. Only the
// latest `MOST` are read: when there are more, `complete` is false and the totals are only what was found; the page
// then says so and shows what the contract itself holds.

import { CARD_CONTRACT_ID } from "./near";

/** FastNEAR's transactions API for NEAR testnet. */
export const INDEX = "https://tx.test.fastnear.com/v0";
/** The most transactions read, and how many the index gives in full at a time. */
const MOST = 200;
const BATCH = 20;

export type CardEvent =
  | { kind: "minted" | "burned"; atMs: number; tx: string; account: string }
  /** `from` is the account that paid in: the paid check contract, when it was a share of a check's fee */
  | { kind: "earned"; atMs: number; tx: string; yocto: string; from: string }
  | { kind: "paid_out"; atMs: number; tx: string; yocto: string }
  | { kind: "rechecked"; atMs: number; tx: string };

export interface CardHistory {
  /** everything that happened to the card, oldest first */
  events: CardEvent[];
  /** each account that has held it, oldest first; `toMs` is null for the one holding it now */
  holders: { account: string; fromMs: number; toMs: number | null }[];
  earnedYocto: string;
  paidOutYocto: string;
  /** false when the contract has more transactions than were read, so older payments may be missing */
  complete: boolean;
}

/** The history couldn't be read from the index. The message says why in a few words, and is safe to show. */
export class HistoryError extends Error {}

/** One receipt of a transaction, as the index gives it. */
interface Receipt {
  receipt?: {
    receiver_id?: string;
    predecessor_id?: string;
    block_timestamp?: number | string;
    receipt?: { Action?: { actions?: { FunctionCall?: { method_name?: string; args?: string; deposit?: string } }[] } };
  };
  execution_outcome?: { outcome?: { logs?: string[]; status?: Record<string, unknown> } };
}
export interface Transaction {
  transaction?: { hash?: string };
  receipts?: Receipt[];
}

/** Something that happened to some card: an event and the card it happened to. */
type Happened = CardEvent & { fingerprint: string };

const ZERO = BigInt(0);
const amount = (value: unknown) => (typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : ZERO);
const json = (base64: unknown): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(String(base64)), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
};

/** How long to wait before asking again when the index says it is busy (429) or failed (5xx). */
const RETRY_MS = [400, 1_200];
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function ask<T>(doFetch: typeof fetch, path: string, body: object, retryMs = RETRY_MS): Promise<T> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await doFetch(`${INDEX}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000), cache: "no-store" });
    } catch {
      throw new HistoryError("the index couldn't be reached");
    }
    // the public index limits how often it is asked: when it is busy, wait a moment and ask again
    if ((res.status === 429 || res.status >= 500) && attempt < retryMs.length) {
      await sleep(retryMs[attempt]);
      continue;
    }
    break;
  }
  if (!res.ok) throw new HistoryError(`the index answered ${res.status}`);
  return (await res.json().catch(() => {
    throw new HistoryError("the index answered something that isn't a list");
  })) as T;
}

/**
 * What one transaction did to verified cards. Only a receipt the card contract itself ran, and ran successfully, is
 * believed: a call to a look-alike contract, or one that failed, is nothing.
 */
export function happenedIn(tx: Transaction, contractId: string): Happened[] {
  const hash = tx.transaction?.hash;
  if (!hash) return [];
  const out: Happened[] = [];
  for (const { receipt, execution_outcome } of tx.receipts ?? []) {
    const status = execution_outcome?.outcome?.status ?? {};
    if (receipt?.receiver_id !== contractId || !("SuccessValue" in status || "SuccessReceiptId" in status)) continue;
    const atMs = Math.floor(Number(receipt.block_timestamp ?? 0) / 1e6);
    for (const { FunctionCall: call } of receipt.receipt?.Action?.actions ?? []) {
      const args = (json(call?.args) ?? {}) as Record<string, unknown>;
      const card = (name: string) => (typeof args[name] === "string" ? (args[name] as string) : "");
      if (call?.method_name === "earn" && amount(call.deposit) > ZERO) {
        out.push({ kind: "earned", fingerprint: card("fingerprint"), atMs, tx: hash, yocto: call.deposit!, from: receipt.predecessor_id ?? "" });
      }
      if (call?.method_name === "on_paid_out") {
        // the contract answers what really left: nothing when the payout didn't arrive and went back into the card
        const left = amount(json(status.SuccessValue));
        if (left > ZERO) out.push({ kind: "paid_out", fingerprint: card("token_id"), atMs, tx: hash, yocto: left.toString() });
      }
      if (call?.method_name === "recheck") out.push({ kind: "rechecked", fingerprint: card("fingerprint"), atMs, tx: hash });
    }
    // a mint or a burn is the NFT standard's own event, logged by the contract
    for (const log of execution_outcome?.outcome?.logs ?? []) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      let event: { standard?: unknown; event?: unknown; data?: { owner_id?: unknown; token_ids?: unknown }[] } | null = null;
      try {
        event = JSON.parse(log.slice("EVENT_JSON:".length));
      } catch {
        continue;
      }
      const kind = event?.standard !== "nep171" ? null : event.event === "nft_mint" ? "minted" : event.event === "nft_burn" ? "burned" : null;
      if (!kind || !Array.isArray(event?.data)) continue;
      for (const d of event.data) {
        if (typeof d?.owner_id !== "string" || !Array.isArray(d.token_ids)) continue;
        for (const id of d.token_ids) if (typeof id === "string") out.push({ kind, fingerprint: id, atMs, tx: hash, account: d.owner_id });
      }
    }
  }
  return out;
}

// what a transaction did never changes, so it is read from the index once by each running copy of the site
const known = new Map<string, Happened[]>();
/** Transactions being read from the index right now, by the request reading them. */
const reading = new Map<string, Promise<void>>();

type TxList = { account_txs?: { transaction_hash?: string }[]; resume_token?: string | null };
/**
 * How long one copy of the site reuses the contract's list of transactions before asking the index again: long enough
 * to share it among pages opened in the same moment, short enough that a mint or payment shows on the next visit.
 */
const LIST_FOR_MS = 2_000;
// The list is every card's, so many pages opened at once share one request for it instead of each asking the index,
// which refuses a burst. Kept per fetch function, so a test's fake index never answers for another's.
const lists = new WeakMap<typeof fetch, Map<string, { at: number; list: Promise<TxList> }>>();

function contractTxs(doFetch: typeof fetch, contractId: string, retryMs: number[]): Promise<TxList> {
  let byContract = lists.get(doFetch);
  if (!byContract) lists.set(doFetch, (byContract = new Map()));
  const kept = byContract.get(contractId);
  if (kept && Date.now() - kept.at < LIST_FOR_MS) return kept.list;
  const list = ask<TxList>(doFetch, "/account", { account_id: contractId, limit: MOST }, retryMs);
  byContract.set(contractId, { at: Date.now(), list });
  // a failed answer is never reused (and a late failure never removes a newer list)
  list.catch(() => byContract.get(contractId)?.list === list && byContract.delete(contractId));
  return list;
}

/** A verified card's history, read from the card contract's transactions. Throws HistoryError when the index can't be read. */
export async function cardHistory(fingerprint: string, opts: { contractId?: string; fetch?: typeof fetch; retryMs?: number[] } = {}): Promise<CardHistory> {
  const contractId = opts.contractId ?? CARD_CONTRACT_ID;
  const doFetch = opts.fetch ?? fetch;
  const retryMs = opts.retryMs ?? RETRY_MS;
  const list = await contractTxs(doFetch, contractId, retryMs);
  const hashes = (list.account_txs ?? []).map((row) => row.transaction_hash).filter((h): h is string => typeof h === "string");

  const key = (hash: string) => `${contractId}:${hash}`;
  // a transaction another page is already reading is waited for, not asked for again
  const unread = hashes.filter((h) => !known.has(key(h)) && !reading.has(key(h)));
  const batches = Array.from({ length: Math.ceil(unread.length / BATCH) }, (_, i) => unread.slice(i * BATCH, (i + 1) * BATCH));
  for (const tx_hashes of batches) {
    const batch = ask<{ transactions?: Transaction[] }>(doFetch, "/transactions", { tx_hashes }, retryMs).then(({ transactions }) => {
      for (const tx of transactions ?? []) if (tx.transaction?.hash) known.set(key(tx.transaction.hash), happenedIn(tx, contractId));
    });
    for (const h of tx_hashes) reading.set(key(h), batch);
    batch.then(
      () => tx_hashes.forEach((h) => reading.delete(key(h))),
      () => tx_hashes.forEach((h) => reading.delete(key(h))),
    );
  }
  await Promise.all(new Set(hashes.flatMap((h) => reading.get(key(h)) ?? [])));
  if (known.size > 5_000) known.clear();

  const events: CardEvent[] = hashes
    .flatMap((h) => known.get(key(h)) ?? [])
    .filter((e) => e.fingerprint === fingerprint)
    .map((e): CardEvent => {
      const event: Partial<Happened> = { ...e };
      delete event.fingerprint;
      return event as CardEvent;
    })
    .sort((a, b) => a.atMs - b.atMs);

  const holders: CardHistory["holders"] = [];
  for (const e of events) {
    if (e.kind === "minted") holders.push({ account: e.account, fromMs: e.atMs, toMs: null });
    if (e.kind === "burned" && holders.length) holders[holders.length - 1].toMs = e.atMs;
  }
  const total = (kind: "earned" | "paid_out") => events.reduce((sum, e) => (e.kind === kind ? sum + BigInt(e.yocto) : sum), ZERO).toString();
  return { events, holders, earnedYocto: total("earned"), paidOutYocto: total("paid_out"), complete: !list.resume_token };
}

/**
 * Whether the history adds up to what the contract holds: earned minus paid out is what the card holds now. Only a
 * card that was never burned can be checked this way (a burned card loses what it held), and only a complete history.
 */
export function addsUp(history: CardHistory, holdsYocto: string): boolean | null {
  if (!history.complete || history.events.some((e) => e.kind === "burned")) return null;
  return BigInt(history.earnedYocto) - BigInt(history.paidOutYocto) === BigInt(holdsYocto);
}
