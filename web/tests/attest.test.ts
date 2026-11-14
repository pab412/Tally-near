import { describe, expect, it, vi } from "vitest";
import { handleAttest, type AttestEnv, type Latest } from "@/lib/attest";
import { guessLimiter } from "@/lib/limit";
import type { ProofRecord, Verdict } from "@/lib/near";
import type { Sign } from "@/lib/record";

const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const ENV: AttestEnv = {
  secret: "sample-secret-between-two-servers",
  account: "attester.testnet",
  key: "ed25519:SAMPLEKEYNOTREAL",
  contractId: "proof.attester.testnet",
  rpcUrl: "https://rpc.example",
  address: "203.0.113.7",
  guesses: guessLimiter({ perVisitor: 1_000, windowMs: 60_000 }),
};
const good = { fingerprint: FP, verdict: "Real", check_id: "tally-41" };
const record = (verdict: Verdict, checkId: string, entries = 1): ProofRecord => ({ fingerprint: FP, latest: { verdict, check_id: checkId, recorded_at_ms: 1 }, entries });

const signer = () => vi.fn<Sign>(async (req) => ({ record: record(req.verdict, req.checkId), txHash: "SAMPLEHASH" }));
const none: Latest = async () => null;

describe("Tally's own checks", () => {
  it("writes a real check with the server's key: the fingerprint, the verdict and Tally's id, nothing else", async () => {
    const sign = signer();
    const res = await handleAttest(good, ENV.secret!, ENV, sign, none);
    expect(res).toEqual({ status: 200, body: { record: record("Real", "tally-41"), txHash: "SAMPLEHASH" } });
    expect(sign).toHaveBeenCalledWith({ account: "attester.testnet", key: ENV.key, contractId: ENV.contractId, rpcUrl: ENV.rpcUrl, fingerprint: FP, verdict: "Real", checkId: "tally-41" });
  });

  it("is switched off without its secret, the account or the key, and never writes anywhere but testnet", async () => {
    const sign = signer();
    for (const missing of ["secret", "account", "key"] as const) {
      expect((await handleAttest(good, ENV.secret!, { ...ENV, [missing]: undefined }, sign, none)).status).toBe(503);
    }
    expect((await handleAttest(good, ENV.secret!, { ...ENV, account: "attester.near" }, sign, none)).status).toBe(503);
    expect((await handleAttest(good, ENV.secret!, { ...ENV, contractId: "proof.attester.near" }, sign, none)).status).toBe(503);
    expect(sign).not.toHaveBeenCalled();
  });

  it("refuses anyone without Tally's secret, before it looks at what was sent", async () => {
    const sign = signer();
    const latest = vi.fn<Latest>(none);
    for (const bearer of [null, "", "wrong", ENV.secret + "x", "sample-password"]) {
      expect(await handleAttest(good, bearer, ENV, sign, latest)).toEqual({ status: 401, body: { error: "Not allowed." } });
    }
    expect(await handleAttest({ ...good, secret: ENV.secret, password: ENV.secret }, null, ENV, sign, latest), "the secret in the body is no use").toMatchObject({ status: 401 });
    expect(sign).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
  });

  it("refuses what the registry wouldn't take, and a check id that carries the demo's mark", async () => {
    const sign = signer();
    const bad = [
      null,
      "not json",
      { ...good, fingerprint: "abc" },
      { ...good, fingerprint: FP.toUpperCase() },
      { ...good, verdict: "Maybe" },
      { ...good, verdict: undefined },
      { ...good, check_id: "" },
      { ...good, check_id: "x".repeat(33) },
      { ...good, check_id: "@trader" },
      { ...good, check_id: "has space" },
      { ...good, check_id: 41 },
      { ...good, check_id: "sample-abc12345" },
    ];
    for (const body of bad) expect((await handleAttest(body, ENV.secret!, ENV, sign, none)).status, JSON.stringify(body)).toBe(422);
    expect(sign).not.toHaveBeenCalled();
  });

  it("writes once when the same check arrives twice, and again when it is a correction", async () => {
    const sign = signer();
    const already: Latest = async () => record("Real", "tally-41", 2);
    expect(await handleAttest(good, ENV.secret!, ENV, sign, already)).toEqual({ status: 200, body: { record: record("Real", "tally-41", 2), txHash: null } });
    expect(sign).not.toHaveBeenCalled();

    expect((await handleAttest({ ...good, verdict: "Unclear", check_id: "tally-42" }, ENV.secret!, ENV, sign, already)).status).toBe(200);
    expect((await handleAttest({ ...good, check_id: "tally-43" }, ENV.secret!, ENV, sign, already)).status, "the same verdict from another check is its own entry").toBe(200);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("says only that it couldn't be written when NEAR refuses or can't be read, never why and never the key", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn<Sign>(async () => {
      throw new Error(`key ${ENV.key} was refused`);
    });
    const res = await handleAttest(good, ENV.secret!, ENV, failing, none);
    expect(res).toEqual({ status: 502, body: { error: "That couldn't be written to NEAR. Try again in a moment." } });
    const unread = await handleAttest(good, ENV.secret!, ENV, signer(), async () => {
      throw new Error("rpc down");
    });
    expect(unread.status).toBe(502);
    expect(JSON.stringify([res, unread])).not.toContain("SAMPLEKEYNOTREAL");
    log.mockRestore();
  });

  it("stops a caller who keeps guessing the secret, even once they guess it", async () => {
    const sign = signer();
    const env = { ...ENV, guesses: guessLimiter({ perVisitor: 10, windowMs: 60_000 }) };
    for (let i = 0; i < 10; i++) expect((await handleAttest(good, `guess-${i}`, env, sign, none)).status).toBe(401);
    expect((await handleAttest(good, ENV.secret!, env, sign, none)).status).toBe(429);
    expect(sign).not.toHaveBeenCalled();
  });
});
