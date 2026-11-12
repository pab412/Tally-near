// The front page's ledger: what the three contracts hold right now, as rows.
//
// The proof registry answers by fingerprint and keeps no list of its cards, so the ledger can only ask about cards it
// can name: the ones this site knows (its own samples and the README's example record) and every card that has a
// verified card, which the card contract does list. The registry's own count says how many cards there are in all,
// so the page can say plainly when it is showing fewer. Any other card is found by pasting its fingerprint.

import { isFingerprint } from "./fingerprint";
import {
  CARD_CONTRACT_ID,
  CHECK_CONTRACT_ID,
  checkTerms,
  lookup,
  toVerifiedCard,
  verifiedCard,
  viewCall,
  type CheckTerms,
  type NearOptions,
  type NftToken,
  type Proof,
  type VerifiedCard,
} from "./near";

/**
 * One card on record: its fingerprint, every verdict it has had (oldest first) and its verified card. `held` is null
 * when the card has none, and "unknown" when the card contract couldn't be read: that is never shown as "none".
 */
export interface LedgerRow {
  fingerprint: string;
  history: Proof[];
  held: VerifiedCard | null | "unknown";
}

export interface Ledger {
  /** How many cards the registry says it holds. Null when it couldn't be read. */
  cards: number | null;
  /** The cards the ledger could name that have a record, the latest verdict first. */
  rows: LedgerRow[];
  /** The named cards NEAR couldn't be asked about just now. They are left out of the rows, never guessed. */
  unread: string[];
  /** Every verified card the card contract lists (its first page). Null when that contract couldn't be read. */
  verified: VerifiedCard[] | null;
  /** How many verified cards exist. Null when it couldn't be read. */
  verifiedTotal: number | null;
  /** What a paid check costs and how many were answered. Null when that contract couldn't be read. */
  terms: CheckTerms | null;
}

export type LedgerOptions = NearOptions & { cardContractId?: string; checkContractId?: string };

/** Verified cards asked for in one go: the contract's own page size is the same. */
const PAGE = 50;

export const latestOf = (row: LedgerRow): Proof => row.history[row.history.length - 1];

const cardOptions = (opts: LedgerOptions): NearOptions => ({ ...opts, contractId: opts.cardContractId ?? CARD_CONTRACT_ID });

/** A card's history, or null when Tally never checked it. */
async function historyOf(fingerprint: string, opts: LedgerOptions): Promise<Proof[] | null> {
  const found = await lookup(fingerprint, opts);
  if (!found.found) return null;
  return found.history.length ? found.history : [found.record.latest]; // a record always has its latest entry
}

/**
 * Reads the ledger. `known`: the fingerprints this site can name. Each contract is read on its own, so one that can't
 * be reached leaves its part out (null) and never takes the others with it.
 */
export async function loadLedger(known: readonly string[], opts: LedgerOptions = {}): Promise<Ledger> {
  const card = cardOptions(opts);
  const [cards, tokens, supply, terms] = await Promise.all([
    viewCall<number>("cards", {}, opts).catch(() => null),
    viewCall<NftToken[]>("nft_tokens", { limit: PAGE }, card).catch(() => null),
    viewCall<string>("nft_total_supply", {}, card).catch(() => null),
    checkTerms({ ...opts, contractId: opts.checkContractId ?? CHECK_CONTRACT_ID }).catch(() => null),
  ]);
  const verified = tokens?.map(toVerifiedCard) ?? null;

  const names = [...new Set([...known, ...(verified ?? []).map((v) => v.fingerprint)])].filter(isFingerprint);
  const answers = await Promise.all(names.map((fp) => historyOf(fp, opts).catch(() => "unread" as const)));
  const rows = names.flatMap((fingerprint, i): LedgerRow[] => {
    const history = answers[i];
    if (history === null || history === "unread") return [];
    // the list of verified cards was read once, above: each row finds its own in it
    return [{ fingerprint, history, held: verified ? (verified.find((v) => v.fingerprint === fingerprint) ?? null) : "unknown" }];
  });
  rows.sort((a, b) => latestOf(b).recorded_at_ms - latestOf(a).recorded_at_ms);

  return {
    cards,
    rows,
    unread: names.filter((_, i) => answers[i] === "unread"),
    verified,
    verifiedTotal: supply === null ? (verified?.length ?? null) : Number(supply),
    terms,
  };
}

/** One card, looked up by its whole fingerprint: its row, or null when Tally never checked it. */
export async function findCard(fingerprint: string, opts: LedgerOptions = {}): Promise<LedgerRow | null> {
  const history = await historyOf(fingerprint, opts);
  if (!history) return null;
  return { fingerprint, history, held: await verifiedCard(fingerprint, cardOptions(opts)).catch(() => "unknown" as const) };
}

/** Where an entry stands in its card's history. */
export type EntryPlace = "only" | "corrected" | "correction";

export interface LedgerEntry {
  fingerprint: string;
  proof: Proof;
  place: EntryPlace;
}

/**
 * Every entry of every row, the newest first. A correction is an entry of its own, and the one it corrects stays:
 * "corrected" is an entry a later one replaced, "correction" the entry that stands after one.
 */
export function entriesOf(rows: readonly LedgerRow[]): LedgerEntry[] {
  return rows
    .flatMap(({ fingerprint, history }) =>
      history.map((proof, i) => ({
        fingerprint,
        proof,
        place: history.length === 1 ? ("only" as const) : i < history.length - 1 ? ("corrected" as const) : ("correction" as const),
        at: i,
      })),
    )
    .sort((a, b) => b.proof.recorded_at_ms - a.proof.recorded_at_ms || (a.fingerprint === b.fingerprint ? b.at - a.at : 0))
    .map(({ fingerprint, proof, place }) => ({ fingerprint, proof, place }));
}

/** How many entries the rows hold, and how many of them corrected an earlier one. */
export function tally(rows: readonly LedgerRow[]): { entries: number; corrections: number } {
  const entries = rows.reduce((n, r) => n + r.history.length, 0);
  return { entries, corrections: entries - rows.length };
}

/** What was typed into the search, as it is compared: lower case, with spaces and the "…" of a short fingerprint out. */
export const searchText = (typed: string) => typed.toLowerCase().replace(/[\s…]|\.{3}/g, "");

/**
 * The rows a search keeps. A short fingerprint as the page prints it ("3171ca6c…36599e58") matches by its two ends;
 * anything else matches anywhere in the fingerprint or in the card's name.
 */
export function searchRows<T extends { fingerprint: string }>(rows: readonly T[], typed: string, nameOf: (fingerprint: string) => string = () => ""): T[] {
  const text = searchText(typed);
  if (!text) return [...rows];
  const ends = /^(.+?)(?:…|\.{3})(.+)$/.exec(typed.toLowerCase().replace(/\s/g, ""));
  return rows.filter(
    ({ fingerprint }) =>
      fingerprint.includes(text) ||
      (ends !== null && fingerprint.startsWith(ends[1]) && fingerprint.endsWith(ends[2])) ||
      searchText(nameOf(fingerprint)).includes(text),
  );
}

/**
 * Tally's own real checks, as tallypnl.com lists them: fingerprints and counts, nothing that says whose card it is.
 * The list only tells the ledger which fingerprints to ask NEAR about: every verdict it shows still comes from NEAR.
 * `tally` is Tally's own totals, off the chain.
 */
export interface TallyChecks {
  records: { fingerprint: string; kind: "card" | "fake" | "cleared" }[];
  tally: { counted: number; caught: number };
}

const KINDS = ["card", "fake", "cleared"];
const count = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0);

/** Reads that list. Null when it can't be read or isn't what was expected: the ledger then shows what it can name itself. */
export async function tallyChecks(url: string, doFetch: typeof fetch = fetch): Promise<TallyChecks | null> {
  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { records?: unknown; tally?: { counted?: unknown; caught?: unknown } } | null;
    if (!body || !Array.isArray(body.records)) return null;
    const records = body.records
      .filter((r): r is TallyChecks["records"][number] => isFingerprint(r?.fingerprint) && KINDS.includes(r?.kind))
      .slice(0, 50)
      .map(({ fingerprint, kind }) => ({ fingerprint, kind }));
    return { records, tally: { counted: count(body.tally?.counted), caught: count(body.tally?.caught) } };
  } catch {
    return null;
  }
}
