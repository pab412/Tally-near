import { describe, expect, it, vi } from "vitest";
import { formatDay, lookup, LookupError, type Proof, type ProofRecord } from "@/lib/near";

const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const AT = Date.UTC(2026, 10, 10, 22, 4); // 10 Nov 2026

// A fake NEAR RPC node: answers each view call from a table, in the same shape as the real one.
function fakeNear(answers: Record<string, unknown>) {
  const calls: { method: string; args: unknown; contract: string }[] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const { params } = JSON.parse(String(init?.body));
    calls.push({ method: params.method_name, args: JSON.parse(atob(params.args_base64)), contract: params.account_id });
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(answers[params.method_name])));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: "tally", result: { result: bytes, logs: [] } }));
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const fake: Proof = { verdict: "Fake", check_id: "sample-a1", recorded_at_ms: AT };
const real: Proof = { verdict: "Real", check_id: "sample-a1-appeal", recorded_at_ms: AT + 60_000 };

describe("lookup", () => {
  it("asks the proof contract for the card and returns its verdict", async () => {
    const record: ProofRecord = { fingerprint: FP, latest: fake, entries: 1 };
    const near = fakeNear({ get: record });
    const result = await lookup(FP, { fetch: near.fetch, contractId: "proof.sample.testnet" });
    expect(result).toEqual({ found: true, record, history: [fake] });
    expect(near.calls).toEqual([{ method: "get", args: { fingerprint: FP }, contract: "proof.sample.testnet" }]);
  });

  it("fetches the full history when a verdict was corrected", async () => {
    const near = fakeNear({ get: { fingerprint: FP, latest: real, entries: 2 }, history: [fake, real] });
    const result = await lookup(FP, { fetch: near.fetch });
    expect(result.found && result.history.map((p) => p.verdict)).toEqual(["Fake", "Real"]);
    expect(near.calls.map((c) => c.method)).toEqual(["get", "history"]);
  });

  it("says so when Tally has never checked the card", async () => {
    const near = fakeNear({ get: null });
    expect(await lookup(FP, { fetch: near.fetch })).toEqual({ found: false });
  });

  it("refuses a bad fingerprint without asking NEAR", async () => {
    const near = fakeNear({});
    await expect(lookup("not-a-hash", { fetch: near.fetch })).rejects.toBeInstanceOf(LookupError);
    expect(near.calls).toHaveLength(0);
  });

  it("gives a plain error when NEAR is unreachable or answers with an error", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(lookup(FP, { fetch: offline })).rejects.toThrow("Couldn't reach NEAR");

    const broken = (async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: "tally", error: { message: "boom" } }))) as unknown as typeof fetch;
    await expect(lookup(FP, { fetch: broken })).rejects.toThrow("NEAR couldn't read the contract");

    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(lookup(FP, { fetch: down })).rejects.toThrow("NEAR didn't answer");
  });

  it("shows the chain's time as a plain date", () => {
    expect(formatDay(AT, "UTC")).toBe("10 Nov 2026");
  });
});
