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
}

/** A token as the card contract's standard NFT views return it. */
export interface NftToken {
  token_id: string;
  owner_id: string;
  metadata?: { issued_at?: string | null; extra?: string | null } | null;
}

export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "proof.notpab.testnet";
export const CARD_CONTRACT_ID = process.env.NEXT_PUBLIC_CARD_CONTRACT_ID || "card.notpab.testnet";
export const RPC_URL = process.env.NEXT_PUBLIC_NEAR_RPC || "https://rpc.testnet.fastnear.com";

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

/** Calls a read-only contract function and returns its JSON result. */
export async function viewCall<T>(method: string, args: object, opts: NearOptions = {}): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(opts.rpcUrl ?? RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "tally",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "optimistic", // the newest block, so a record shows up the moment it is written
          account_id: opts.contractId ?? CONTRACT_ID,
          method_name: method,
          args_base64: btoa(JSON.stringify(args)),
        },
      }),
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

/** Looks a card up: its current verdict and, when it has been corrected, every entry oldest first. */
export async function lookup(fingerprint: string, opts: NearOptions = {}): Promise<Lookup> {
  if (!isFingerprint(fingerprint)) throw new LookupError("That isn't a card fingerprint.");
  const record = await viewCall<ProofRecord | null>("get", { fingerprint }, opts);
  if (!record) return { found: false };
  const history = record.entries > 1 ? await viewCall<Proof[]>("history", { fingerprint }, opts) : [record.latest];
  return { found: true, record, history };
}

export function toVerifiedCard(token: NftToken): VerifiedCard {
  let checkId = "";
  try {
    checkId = String(JSON.parse(token.metadata?.extra ?? "{}").check_id ?? "");
  } catch {
    // a token whose extra isn't JSON still has a holder and a date
  }
  return { fingerprint: token.token_id, holder: token.owner_id, mintedAtMs: Number(token.metadata?.issued_at ?? 0), checkId };
}

/** The verified card for a fingerprint, or null when it has none. `contractId` here is the card contract. */
export async function verifiedCard(fingerprint: string, opts: NearOptions = {}): Promise<VerifiedCard | null> {
  if (!isFingerprint(fingerprint)) throw new LookupError("That isn't a card fingerprint.");
  const token = await viewCall<NftToken | null>("nft_token", { token_id: fingerprint }, { ...opts, contractId: opts.contractId ?? CARD_CONTRACT_ID });
  return token && toVerifiedCard(token);
}

const TESTNET_ACCOUNT_RE = /^(?=.{9,64}$)(?:[a-z\d]+(?:[-_][a-z\d]+)*\.)+testnet$/;

/** A named NEAR testnet account, like `name.testnet`. */
export function isTestnetAccount(value: unknown): value is string {
  return typeof value === "string" && TESTNET_ACCOUNT_RE.test(value);
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
