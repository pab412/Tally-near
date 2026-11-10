import { describe, expect, it, vi } from "vitest";
import type { DemoEnv } from "@/lib/demo";
import { handleRecord, newCheckId, type Sign } from "@/lib/record";

const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const ENV: DemoEnv = {
  password: "sample-password",
  account: "attester.testnet",
  key: "ed25519:SAMPLEKEYNOTREAL",
  contractId: "proof.attester.testnet",
  rpcUrl: "https://rpc.example",
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

  it("marks demo check ids as samples, within the contract's limits", () => {
    const id = newCheckId();
    expect(id).toMatch(/^sample-[a-z0-9]{8}$/);
    expect(id.length).toBeLessThanOrEqual(32);
  });
});
