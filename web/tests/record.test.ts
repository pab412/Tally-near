import { describe, expect, it, vi } from "vitest";
import { HOSTED_REGISTRY, KEPT_CARDS, type DemoEnv } from "@/lib/demo";
import { guessLimiter } from "@/lib/limit";
import { DEMO_RECORD_FP } from "@/lib/near";
import { sampleFingerprints } from "@/lib/sample";
import { handleRecord, newCheckId, type Sign } from "@/lib/record";

const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const ENV: DemoEnv = {
  password: "sample-password",
  account: "attester.testnet",
  key: "ed25519:SAMPLEKEYNOTREAL",
  contractId: "proof.attester.testnet",
  rpcUrl: "https://rpc.example",
  read: async () => null,
  address: "203.0.113.7",
  guesses: guessLimiter({ perVisitor: 1_000, windowMs: 60_000 }),
};
const good = { password: "sample-password", fingerprint: FP, verdict: "Fake" };

function okSigner() {
  return vi.fn<Sign>(async (req) => ({
    record: { fingerprint: req.fingerprint, latest: { verdict: req.verdict, check_id: req.checkId, recorded_at_ms: 1 }, entries: 1 },
    txHash: "SAMPLEHASH",
  }));
}

describe("record route", () => {
  it("records with the server's key and returns the record and transaction", async () => {
    const sign = okSigner();
    const res = await handleRecord(good, ENV, sign, () => "sample-abc12345");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ txHash: "SAMPLEHASH", record: { latest: { verdict: "Fake", check_id: "sample-abc12345" } } });
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({ account: "attester.testnet", fingerprint: FP, verdict: "Fake" }));
  });

  it("is switched off when the password or key isn't set", async () => {
    const sign = okSigner();
    expect((await handleRecord(good, { ...ENV, key: undefined }, sign)).status).toBe(503);
    expect((await handleRecord(good, { ...ENV, password: "" }, sign)).status).toBe(503);
    expect(sign).not.toHaveBeenCalled();
  });

  it("refuses to run against a mainnet account", async () => {
    const sign = okSigner();
    expect((await handleRecord(good, { ...ENV, account: "sample.near" }, sign)).status).toBe(503);
    expect((await handleRecord(good, { ...ENV, contractId: "proof.sample.near" }, sign)).status).toBe(503);
    expect(sign).not.toHaveBeenCalled();
  });

  it("refuses a wrong or missing password before looking at anything else", async () => {
    const sign = okSigner();
    expect((await handleRecord({ ...good, password: "guess" }, ENV, sign)).status).toBe(401);
    expect((await handleRecord({ fingerprint: FP, verdict: "Fake" }, ENV, sign)).status).toBe(401);
    expect((await handleRecord(null, ENV, sign)).status).toBe(401);
    expect(sign).not.toHaveBeenCalled();
  });

  it("refuses a bad fingerprint or verdict", async () => {
    const sign = okSigner();
    expect((await handleRecord({ ...good, fingerprint: "@sample_trader" }, ENV, sign)).status).toBe(422);
    expect((await handleRecord({ ...good, verdict: "Scam" }, ENV, sign)).status).toBe(422);
    expect(sign).not.toHaveBeenCalled();
  });

  it("hides NEAR's error details and the key from the browser", async () => {
    const sign = vi.fn<Sign>(async () => {
      throw new Error("signer ed25519:SAMPLEKEYNOTREAL rejected");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleRecord(good, ENV, sign);
    spy.mockRestore();
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("SAMPLEKEY");
  });

  it("never writes over one of Tally's own checks, nor the site's own example cards, and asks NEAR first", async () => {
    const sign = okSigner();
    const tallys = { fingerprint: FP, latest: { verdict: "Fake" as const, check_id: "tally-42", recorded_at_ms: 1 }, entries: 1 };
    expect((await handleRecord(good, { ...ENV, read: async () => tallys }, sign)).status).toBe(409);
    const hosted = { ...ENV, contractId: HOSTED_REGISTRY };
    for (const fingerprint of KEPT_CARDS) expect((await handleRecord({ ...good, fingerprint }, hosted, sign)).status).toBe(409);
    expect((await handleRecord(good, { ...ENV, read: async () => Promise.reject(new Error("down")) }, sign)).status).toBe(502);
    expect(sign).not.toHaveBeenCalled();
    const ours = { ...tallys, latest: { ...tallys.latest, check_id: "sample-abc12345" } };
    expect((await handleRecord(good, { ...ENV, read: async () => ours }, sign)).status).toBe(200);
    // a copy of the site run against its own registry may record the sample cards, as the README's steps do
    expect((await handleRecord({ ...good, fingerprint: [...KEPT_CARDS][1] }, ENV, sign)).status).toBe(200);
  });

  it("keeps the very sample cards the site shows", () => {
    for (const file of ["sample-card-a.png", "sample-card-b.png"]) expect(KEPT_CARDS.has(sampleFingerprints(file).fingerprint)).toBe(true);
    expect(KEPT_CARDS.has(DEMO_RECORD_FP)).toBe(true);
  });

  it("marks demo check ids as samples, within the contract's limits", () => {
    const id = newCheckId();
    expect(id).toMatch(/^sample-[a-z0-9]{8}$/);
    expect(id.length).toBeLessThanOrEqual(32);
  });

  it("stops a visitor who keeps guessing the password, even once they guess it, and nobody else", async () => {
    const sign = okSigner();
    const env = { ...ENV, guesses: guessLimiter({ perVisitor: 10, windowMs: 60_000 }) };
    for (let i = 0; i < 3; i++) expect((await handleRecord(good, env, sign, () => "sample-abc12345")).status, "the right password never counts").toBe(200);
    for (let i = 0; i < 10; i++) expect((await handleRecord({ ...good, password: `guess-${i}` }, env, sign)).status).toBe(401);
    const right = await handleRecord(good, env, sign);
    expect(right.status).toBe(429);
    expect(right.body).toEqual({ error: "Too many wrong passwords. Wait a few minutes and try again." });
    expect(sign).toHaveBeenCalledTimes(3);
    expect((await handleRecord(good, { ...env, address: "198.51.100.9" }, sign, () => "sample-abc12345")).status).toBe(200);
  });
});
