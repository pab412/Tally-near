// Reading Tally's contracts on NEAR testnet: the proof registry and the verified card. Lookups go straight from the
// browser to a public NEAR RPC node: no server, no wallet, no key.

import { isFingerprint } from "./fingerprint";

export const VERDICTS = ["Real", "Unclear", "Fake"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface Proof {
  verdict: Verdict;
  check_id: string;
  recorded_at_ms: number;
}

export interface ProofRecord {
  fingerprint: string;
  latest: Proof;
  entries: number;
}

export type Lookup = { found: false } | { found: true; record: ProofRecord; history: Proof[] };

/** A verified card: the NFT a card found Real can have (contracts/card). */
export interface VerifiedCard {
  fingerprint: string;
  holder: string;
  mintedAtMs: number;
  /** The check it came from. */
  checkId: string;
  /** What the card holds, in yoctoNEAR: its share of the fees agents paid to check it. */
  holdsYocto: string;
}

/** What a paid check costs and where it looks, as the paid check contract states it (contracts/check `terms`). */
export interface CheckTerms {
  /** One answered check, in yoctoNEAR. */
  fee: string;
  /** The share of the fee paid into the card's verified card. */
  trader_percent: number;
  registry: string;
  cards: string;
  /** How many checks have been answered and charged. */
  checks: number;
}

/** A token as the card contract's standard NFT views return it. */
export interface NftToken {
  token_id: string;
  owner_id: string;
  metadata?: { issued_at?: string | null; extra?: string | null } | null;
}

export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "proof.notpab.testnet";
export const CARD_CONTRACT_ID = process.env.NEXT_PUBLIC_CARD_CONTRACT_ID || "card.notpab.testnet";
export const CHECK_CONTRACT_ID = process.env.NEXT_PUBLIC_CHECK_CONTRACT_ID || "check.notpab.testnet";
/** The guard wallet (contracts/guard): an example wallet that asks the registry before it pays. */
export const GUARD_CONTRACT_ID = process.env.NEXT_PUBLIC_GUARD_CONTRACT_ID || "tally-guard.testnet";
export const RPC_URL = process.env.NEXT_PUBLIC_NEAR_RPC || "https://rpc.testnet.fastnear.com";
/**
 * Where the ledger reads the list of Tally's own real checks (fingerprints and counts only, lib/ledger.ts tallyChecks):
 * this site's own route, which asks tallypnl.com. The browser still talks to this site and NEAR, nothing else.
 */
export const TALLY_CHECKS_PATH = "/api/tally";

const EXPLORER = "https://testnet.nearblocks.io";
export const explorerAccountUrl = (accountId: string) => `${EXPLORER}/address/${encodeURIComponent(accountId)}`;
export const explorerTxUrl = (txHash: string) => `${EXPLORER}/txns/${encodeURIComponent(txHash)}`;

/** A lookup that couldn't be completed. The message is safe to show as is. */
export class LookupError extends Error {}

export interface NearOptions {
  rpcUrl?: string;
  contractId?: string;
  fetch?: typeof fetch;
}

/**
 * The JSON-RPC request that reads a contract. This site sends exactly this, and the For AI agents page prints it, so
 * what an agent is shown is what works.
 */
export function viewRequest(method: string, args: object, contractId: string) {
  return {
    jsonrpc: "2.0",
    id: "tally",
    method: "query",
    params: {
      request_type: "call_function",
      finality: "optimistic", // the newest block, so a record shows up the moment it is written
      account_id: contractId,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
    },
  };
}

/** The same request as a command to paste into a terminal: what the For AI agents page gives a developer to copy. */
export const curlFor = (method: string, args: object, contractId: string) =>
  `curl -s ${RPC_URL} \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify(viewRequest(method, args, contractId))}'`;

/** Calls a read-only contract function and returns its JSON result. */
export async function viewCall<T>(method: string, args: object, opts: NearOptions = {}): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(opts.rpcUrl ?? RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(viewRequest(method, args, opts.contractId ?? CONTRACT_ID)),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new LookupError("Couldn't reach NEAR. Check your connection and try again.");
  }
  if (!res.ok) throw new LookupError("NEAR didn't answer. Try again in a moment.");

  const json = await res.json().catch(() => null);
  const bytes = json?.result?.result;
  if (json?.error || json?.result?.error || !Array.isArray(bytes)) {
    throw new LookupError("NEAR couldn't read the contract. Try again in a moment.");
  }
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes))) as T;
}

/** A card's record on the registry: its latest verdict and how many entries it has. Null when Tally never checked it. */
export async function latestRecord(fingerprint: string, opts: NearOptions = {}): Promise<ProofRecord | null> {
  if (!isFingerprint(fingerprint)) throw new LookupError("That isn't a card fingerprint.");
  return viewCall<ProofRecord | null>("get", { fingerprint }, opts);
}

/** Looks a card up: its current verdict and, when it has been corrected, every entry oldest first. */
export async function lookup(fingerprint: string, opts: NearOptions = {}): Promise<Lookup> {
  const record = await latestRecord(fingerprint, opts);
  if (!record) return { found: false };
  const history = record.entries > 1 ? await viewCall<Proof[]>("history", { fingerprint }, opts) : [record.latest];
  return { found: true, record, history };
}

export function toVerifiedCard(token: NftToken): VerifiedCard {
  let extra: { check_id?: unknown; holds?: unknown } = {};
  try {
    extra = JSON.parse(token.metadata?.extra ?? "{}") ?? {};
  } catch {
    // a token whose extra isn't JSON still has a holder and a date
  }
  const holds = String(extra.holds ?? "0");
  return {
    fingerprint: token.token_id,
    holder: token.owner_id,
    mintedAtMs: Number(token.metadata?.issued_at ?? 0),
    checkId: String(extra.check_id ?? ""),
    holdsYocto: /^\d+$/.test(holds) ? holds : "0",
  };
}

/** The verified card for a fingerprint, or null when it has none. `contractId` here is the card contract. */
export async function verifiedCard(fingerprint: string, opts: NearOptions = {}): Promise<VerifiedCard | null> {
  if (!isFingerprint(fingerprint)) throw new LookupError("That isn't a card fingerprint.");
  const token = await viewCall<NftToken | null>("nft_token", { token_id: fingerprint }, { ...opts, contractId: opts.contractId ?? CARD_CONTRACT_ID });
  return token && toVerifiedCard(token);
}

/** What a paid check costs right now, read from the paid check contract. `contractId` here is that contract. */
export function checkTerms(opts: NearOptions = {}): Promise<CheckTerms> {
  return viewCall<CheckTerms>("terms", {}, { ...opts, contractId: opts.contractId ?? CHECK_CONTRACT_ID });
}

const TESTNET_ACCOUNT_RE = /^(?=.{9,64}$)(?:[a-z\d]+(?:[-_][a-z\d]+)*\.)+testnet$/;

/** A named NEAR testnet account, like `name.testnet`. */
export function isTestnetAccount(value: unknown): value is string {
  return typeof value === "string" && TESTNET_ACCOUNT_RE.test(value);
}

/** A fingerprint that has a record on proof.notpab.testnet: the README and the front page open it as a real example. */
export const DEMO_RECORD_FP = "cab484af6173d22914dcb29a6b5911c0671c33fdd0ef84bfdac8fed23be332b8";

/** A fingerprint's first and last eight characters, for a table row: the whole one is shown where there's room. */
export const shortFingerprint = (fp: string) => `${fp.slice(0, 8)}…${fp.slice(-8)}`;

/** What a check found, as one plain sentence. */
export function verdictSentence(proof: Proof, timeZone?: string): string {
  const found = proof.verdict === "Unclear" ? "couldn't tell whether it's real" : `found it ${proof.verdict.toLowerCase()}`;
  return `Tally checked this card on ${formatDay(proof.recorded_at_ms, timeZone)} and ${found}.`;
}

/** "10 Nov 2026" in the visitor's time zone (or the one given, for tests). */
export function formatDay(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(ms);
}

/** "10 Nov 2026, 22:04" for history rows. */
export function formatMoment(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(ms);
}
