import { describe, expect, it, vi } from "vitest";
import { entriesOf, findCard, loadLedger, searchRows, tally, tallyChecks, type LedgerRow } from "@/lib/ledger";
import { shortFingerprint, type NftToken, type Proof } from "@/lib/near";

const A = "a".repeat(64); // checked, then corrected
const B = "b".repeat(64); // checked, and has a verified card
const C = "c".repeat(64); // never checked
const D = "d".repeat(64); // has a verified card, but this site can't name it
const AT = Date.UTC(2026, 10, 10, 22, 4);

const fake: Proof = { verdict: "Fake", check_id: "a1", recorded_at_ms: AT };
const fixed: Proof = { verdict: "Real", check_id: "a1-appeal", recorded_at_ms: AT + 60_000 };
const real: Proof = { verdict: "Real", check_id: "b1", recorded_at_ms: AT + 30_000 };
const late: Proof = { verdict: "Real", check_id: "d1", recorded_at_ms: AT + 90_000 };

const token = (fp: string, checkId: string): NftToken => ({
  token_id: fp,
  owner_id: "trader.testnet",
  metadata: { issued_at: String(AT + 120_000), extra: JSON.stringify({ check_id: checkId, holds: "5000000000000000000000" }) },
});

const HISTORY: Record<string, Proof[]> = { [A]: [fake, fixed], [B]: [real], [D]: [late] };
const TERMS = { fee: "10000000000000000000000", trader_percent: 50, registry: "proof.sample.testnet", cards: "card.sample.testnet", checks: 7 };

/** What the three contracts hold in these tests. `down` names a contract that can't be read; `lost` a card whose lookup fails. */
function near({ down, lost }: { down?: string; lost?: string } = {}) {
  const calls: string[] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const { params } = JSON.parse(String(init?.body));
    const args = JSON.parse(atob(params.args_base64));
    const fp: string = args.fingerprint ?? args.token_id;
    calls.push(`${params.account_id} ${params.method_name}${fp ? ` ${fp[0]}` : ""}`);
    if (params.account_id === down || (fp && fp === lost)) return new Response(JSON.stringify({ error: { message: "can't be read" } }));
    const history = HISTORY[fp];
    const answer = {
      cards: 5,
      get: history ? { fingerprint: fp, latest: history[history.length - 1], entries: history.length } : null,
      history,
      nft_tokens: [token(B, "b1"), token(D, "d1")],
      nft_total_supply: "2",
      nft_token: fp === B ? token(B, "b1") : null,
      terms: TERMS,
    }[params.method_name as string];
    return new Response(JSON.stringify({ result: { result: Array.from(new TextEncoder().encode(JSON.stringify(answer ?? null))) } }));
  }) as unknown as typeof globalThis.fetch;
  return { calls, opts: { fetch, contractId: "proof.sample.testnet", cardContractId: "card.sample.testnet", checkContractId: "check.sample.testnet" } };
}

describe("the front page's ledger", () => {
  it("reads each contract's count, and a row for every card it can name: the site's own and every verified card", async () => {
    const { calls, opts } = near();
    const ledger = await loadLedger([A, B, C], opts);

    expect(ledger.cards, "the registry's own count, which can be more than the rows").toBe(5);
    expect(ledger.verifiedTotal).toBe(2);
    expect(ledger.terms).toEqual(TERMS);
    expect(ledger.rows.map((r) => r.fingerprint), "the latest verdict first").toEqual([D, A, B]);
    expect(ledger.rows[1].history, "a corrected card keeps every entry, oldest first").toEqual([fake, fixed]);
    expect(ledger.rows.map((r) => (r.held && r.held !== "unknown" ? r.held.holder : r.held))).toEqual(["trader.testnet", null, "trader.testnet"]);
    expect(ledger.unread, "a card with no record is not a row, and not one that couldn't be read").toEqual([]);

    expect(calls.filter((c) => c.startsWith("card.sample.testnet")).sort()).toEqual(["card.sample.testnet nft_tokens", "card.sample.testnet nft_total_supply"]);
    expect(calls).toContain("check.sample.testnet terms");
    expect(calls.filter((c) => c.endsWith("get b")), "a card that is both named and verified is asked about once").toHaveLength(1);
  });

  it("leaves out what a contract that can't be read would have said, and never guesses it", async () => {
    const noCards = await loadLedger([A, B, C], near({ down: "card.sample.testnet" }).opts);
    expect(noCards.verified).toBeNull();
    expect(noCards.verifiedTotal).toBeNull();
    expect(noCards.rows.map((r) => [r.fingerprint, r.held]), "a verified card that couldn't be read is unknown, never none").toEqual([
      [A, "unknown"],
      [B, "unknown"],
    ]);
    expect(noCards.cards).toBe(5);
    expect(noCards.terms).toEqual(TERMS);

    const noRegistry = await loadLedger([A, B, C], near({ down: "proof.sample.testnet" }).opts);
    expect(noRegistry.cards).toBeNull();
    expect(noRegistry.rows).toEqual([]);
    expect(noRegistry.unread).toEqual([A, B, C, D]);
    expect(noRegistry.verified).toHaveLength(2);

    expect((await loadLedger([A], near({ down: "check.sample.testnet" }).opts)).terms).toBeNull();
  });

  it("keeps the other rows when one card can't be read, and ignores a name that isn't a fingerprint", async () => {
    const ledger = await loadLedger([A, B, "not-a-fingerprint"], near({ lost: A }).opts);
    expect(ledger.rows.map((r) => r.fingerprint)).toEqual([D, B]);
    expect(ledger.unread).toEqual([A]);
  });

  it("finds one card by its whole fingerprint, with its verified card", async () => {
    const { opts } = near();
    expect(await findCard(B, opts)).toEqual({
      fingerprint: B,
      history: [real],
      held: { fingerprint: B, holder: "trader.testnet", mintedAtMs: AT + 120_000, checkId: "b1", holdsYocto: "5000000000000000000000" },
    });
    expect(await findCard(A, opts)).toEqual({ fingerprint: A, history: [fake, fixed], held: null });
    expect(await findCard(C, opts), "no record: Tally never checked it").toBeNull();
    expect((await findCard(B, near({ down: "card.sample.testnet" }).opts))?.held).toBe("unknown");
    await expect(findCard(A, near({ down: "proof.sample.testnet" }).opts)).rejects.toThrow("NEAR couldn't read the contract");
  });
});

describe("the ledger's rows", () => {
  const rows: LedgerRow[] = [
    { fingerprint: A, history: [fake, fixed], held: null },
    { fingerprint: B, history: [real], held: null },
  ];

  it("lists every entry newest first, and says which entries a correction touched", () => {
    expect(entriesOf(rows).map((e) => [e.fingerprint, e.proof.check_id, e.place])).toEqual([
      [A, "a1-appeal", "correction"],
      [B, "b1", "only"],
      [A, "a1", "corrected"],
    ]);
  });

  it("puts a correction above the entry it corrects when NEAR stamped both with the same time", () => {
    const sameBlock: LedgerRow = { fingerprint: A, history: [fake, { ...fixed, recorded_at_ms: AT }], held: null };
    expect(entriesOf([sameBlock]).map((e) => e.place)).toEqual(["correction", "corrected"]);
  });

  it("counts entries and corrections", () => {
    expect(tally(rows)).toEqual({ entries: 3, corrections: 1 });
    expect(tally([])).toEqual({ entries: 0, corrections: 0 });
  });

  it("searches by any part of a fingerprint, by the short form the page prints, and by the card's name", () => {
    const named = (fp: string) => (fp === A ? "Sample A" : "");
    const mixed = `f00dfeed${"0123456789abcdef".repeat(3)}cafebabe`;
    const all = [...rows, { fingerprint: mixed }];
    const found = (typed: string) => searchRows(all, typed, named).map((r) => r.fingerprint);

    expect(found("")).toEqual([A, B, mixed]);
    expect(found("  ")).toEqual([A, B, mixed]);
    expect(found("89ABcd")).toEqual([mixed]);
    expect(found("0123 4567 89ab")).toEqual([mixed]);
    expect(shortFingerprint(mixed)).toBe("f00dfeed…cafebabe");
    expect(found("f00dfeed…cafebabe"), "copied from a row: its two ends, which aren't next to each other in the fingerprint").toEqual([mixed]);
    expect(found("F00DFEED...cafebabe")).toEqual([mixed]);
    expect(found("cafebabe…f00dfeed"), "the ends the wrong way round match nothing").toEqual([]);
    expect(found(B)).toEqual([B]);
    expect(found("sample a")).toEqual([A]);
    expect(found("zz")).toEqual([]);
  });
});

describe("Tally's own list of real checks", () => {
  const serve = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("keeps fingerprints, their kind and Tally's totals, and drops anything else it is sent", async () => {
    const list = await tallyChecks(
      "/api/tally",
      serve({
        cards: 2,
        records: [
          { fingerprint: A, kind: "card", name: "@trader", ref: "share:7" },
          { fingerprint: B, kind: "fake" },
          { fingerprint: "nope", kind: "card" },
          { fingerprint: C, kind: "owner" },
          null,
        ],
        tally: { counted: 1204, caught: "37" },
      }),
    );
    expect(list).toEqual({ records: [{ fingerprint: A, kind: "card" }, { fingerprint: B, kind: "fake" }], tally: { counted: 1204, caught: 0 } });
  });

  it("is null when Tally can't be read or sends something else, so the ledger shows only what it can name itself", async () => {
    expect(await tallyChecks("/api/tally", serve({ error: "rate_limited" }, 429))).toBeNull();
    expect(await tallyChecks("/api/tally", serve("<html>"))).toBeNull();
    expect(await tallyChecks("/api/tally", serve({ records: "all of them" }))).toBeNull();
    expect(await tallyChecks("/api/tally", (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBeNull();
  });
});
