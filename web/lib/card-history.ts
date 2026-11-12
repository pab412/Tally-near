// A verified card's history: who has held it, what it earned, what was paid out and when a recheck was asked for.
//
// The card contract keeps what a card holds now, not how it got there. The history is the contract's own receipts on
// NEAR: every mint, burn, payment in (`earn`), payout (`on_paid_out`) and recheck is a call anyone can see. NEAR's
// nodes answer for one transaction at a time, so the list comes from NearBlocks' public index of testnet
// (api-testnet.nearblocks.io, v3; no key). Nothing here is written by Tally, and nothing is stored by this site.
//
// The index can't filter by card, so each list is the contract's latest receipts for every card, read through to
// find this one's. When a list is cut off at its first page, `complete` is false and the totals are only what was
// found; the page then says so and shows what the contract itself holds.

import { CARD_CONTRACT_ID } from "./near";

/** NearBlocks' public API for NEAR testnet. */
export const INDEX = "https://api-testnet.nearblocks.io/v3";
/** The most receipts read from one list. */
const PAGE = 100;
/** A list changes as things happen; one transaction never changes once it is final. */
const LIST_SECONDS = 60;

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
  /** false when a list was longer than one page, so older payments may be missing */
  complete: boolean;
}

/** The history couldn't be read from the index. The message is safe to show as is. */
export class HistoryError extends Error {}

interface Receipt {
  receipt_id?: string;
  receiver_account_id?: string;
  predecessor_account_id?: string;
  transaction_hash?: string;
  block?: { block_timestamp?: string };
  actions?: { method?: string | null; args?: { deposit?: string; args_json?: Record<string, unknown> | null } }[];
  outcome?: { status?: boolean; result?: string };
  receipts?: Receipt[];
}

const ZERO = BigInt(0);
const ms = (nanoseconds: string | undefined) => Number(BigInt(nanoseconds ?? "0") / BigInt(1_000_000));

async function ask<T>(doFetch: typeof fetch, path: string, revalidate: number | false): Promise<T> {
  let res: Response;
  try {
    res = await doFetch(`${INDEX}${path}`, { signal: AbortSignal.timeout(12_000), next: { revalidate } } as RequestInit);
  } catch {
    throw new HistoryError("The history couldn't be read right now.");
  }
  if (!res.ok) throw new HistoryError("The history couldn't be read right now.");
  return (await res.json().catch(() => {
    throw new HistoryError("The history couldn't be read right now.");
  })) as T;
}

/** Every receipt in a transaction, the ones it caused included. */
function* all(receipt: Receipt | undefined): Generator<Receipt> {
  if (!receipt) return;
  yield receipt;
  for (const child of receipt.receipts ?? []) yield* all(child);
}

/**
 * The card contract's successful calls of one method, each with the arguments it was called with. The list gives
 * which receipts; each transaction is then read for what the call said.
 */
async function calls(method: string, contractId: string, doFetch: typeof fetch) {
  const list = await ask<{ data?: Receipt[]; meta?: { next_page?: string | null } }>(doFetch, `/accounts/${contractId}/receipts?method=${method}&limit=${PAGE}`, LIST_SECONDS);
  const done = (list.data ?? []).filter((r) => r.outcome?.status && r.receipt_id && r.transaction_hash);
  const found = await Promise.all(
    done.map(async (listed) => {
      const tx = await ask<{ data?: Receipt }>(doFetch, `/txns/${listed.transaction_hash}/receipts`, false);
      const receipt = [...all(tx.data)].find((r) => r.receipt_id === listed.receipt_id && r.receiver_account_id === contractId);
      const action = receipt?.actions?.find((a) => a.method === method);
      return action && receipt ? { receipt, args: action.args?.args_json ?? {}, deposit: action.args?.deposit ?? "0", tx: listed.transaction_hash! } : null;
    }),
  );
  return { calls: found.filter((c) => c !== null), complete: !list.meta?.next_page };
}

const amount = (value: unknown) => (typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : ZERO);

/** What a call answered, when it answered a number in a string (a U128), as `on_paid_out` does. */
function answered(receipt: Receipt): bigint {
  try {
    return amount(JSON.parse(atob(receipt.outcome?.result ?? "")));
  } catch {
    return ZERO;
  }
}

/** A verified card's history, read from the card contract's receipts. Throws HistoryError when the index can't be read. */
export async function cardHistory(fingerprint: string, opts: { contractId?: string; fetch?: typeof fetch } = {}): Promise<CardHistory> {
  const contractId = opts.contractId ?? CARD_CONTRACT_ID;
  const doFetch = opts.fetch ?? fetch;
  const [held, earned, paid, rechecks] = await Promise.all([
    ask<{ data?: { cause?: string; affected_account_id?: string; block_timestamp?: string; transaction_hash?: string }[]; meta?: { next_page?: string | null } }>(
      doFetch,
      `/nfts/${contractId}/tokens/${fingerprint}/txns?limit=${PAGE}`,
      LIST_SECONDS,
    ),
    calls("earn", contractId, doFetch),
    calls("on_paid_out", contractId, doFetch),
    calls("recheck", contractId, doFetch),
  ]);

  const events: CardEvent[] = [];
  for (const h of held.data ?? []) {
    const kind = h.cause === "MINT" ? "minted" : h.cause === "BURN" ? "burned" : null;
    if (kind && h.affected_account_id && h.transaction_hash) events.push({ kind, atMs: ms(h.block_timestamp), tx: h.transaction_hash, account: h.affected_account_id });
  }
  for (const c of earned.calls) {
    if (c.args.fingerprint === fingerprint && amount(c.deposit) > ZERO) events.push({ kind: "earned", atMs: ms(c.receipt.block?.block_timestamp), tx: c.tx, yocto: c.deposit, from: c.receipt.predecessor_account_id ?? "" });
  }
  for (const c of paid.calls) {
    // the contract answers what really left: nothing when the payout didn't arrive and went back into the card
    const left = answered(c.receipt);
    if (c.args.token_id === fingerprint && left > ZERO) events.push({ kind: "paid_out", atMs: ms(c.receipt.block?.block_timestamp), tx: c.tx, yocto: left.toString() });
  }
  for (const c of rechecks.calls) {
    if (c.args.fingerprint === fingerprint) events.push({ kind: "rechecked", atMs: ms(c.receipt.block?.block_timestamp), tx: c.tx });
  }
  events.sort((a, b) => a.atMs - b.atMs);

  const holders: CardHistory["holders"] = [];
  for (const e of events) {
    if (e.kind === "minted") holders.push({ account: e.account, fromMs: e.atMs, toMs: null });
    if (e.kind === "burned" && holders.length) holders[holders.length - 1].toMs = e.atMs;
  }
  const total = (kind: "earned" | "paid_out") => events.reduce((sum, e) => (e.kind === kind ? sum + BigInt(e.yocto) : sum), ZERO).toString();
  return {
    events,
    holders,
    earnedYocto: total("earned"),
    paidOutYocto: total("paid_out"),
    complete: earned.complete && paid.complete && rechecks.complete && !held.meta?.next_page,
  };
}

/**
 * Whether the history adds up to what the contract holds: earned minus paid out is what the card holds now. Only a
 * card that was never burned can be checked this way (a burned card loses what it held), and only a complete history.
 */
export function addsUp(history: CardHistory, holdsYocto: string): boolean | null {
  if (!history.complete || history.events.some((e) => e.kind === "burned")) return null;
  return BigInt(history.earnedYocto) - BigInt(history.paidOutYocto) === BigInt(holdsYocto);
}
