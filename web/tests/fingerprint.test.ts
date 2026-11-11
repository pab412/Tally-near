import { describe, expect, it } from "vitest";
import { fingerprint, fingerprintFromParam, isFingerprint, recordPath } from "@/lib/fingerprint";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("fingerprint", () => {
  it("matches the standard SHA-256 test values", async () => {
    expect(await fingerprint(bytes(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await fingerprint(bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is 64 lower-case hex characters, the form the contract accepts", async () => {
    const fp = await fingerprint(bytes("SAMPLE card"));
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(isFingerprint(fp)).toBe(true);
  });

  it("gives the same picture the same fingerprint, and a one-byte change a different one", async () => {
    const card = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const copy = new Uint8Array(card);
    const edited = new Uint8Array(card);
    edited[10] = 4;
    expect(await fingerprint(copy)).toBe(await fingerprint(card));
    expect(await fingerprint(edited)).not.toBe(await fingerprint(card));
  });

  it("reads the fingerprint a link asks for, and ignores anything else in its place", () => {
    const fp = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(recordPath(fp)).toBe(`/demo?fp=${fp}`);
    expect(fingerprintFromParam(fp)).toBe(fp);
    expect(fingerprintFromParam([fp, "x"])).toBe(fp);
    expect(fingerprintFromParam(undefined)).toBeNull();
    expect(fingerprintFromParam("@sample_trader")).toBeNull();
    expect(fingerprintFromParam(`${fp}<script>`)).toBeNull();
  });

  it("refuses anything that isn't a fingerprint", () => {
    const fp = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(isFingerprint(fp.toUpperCase())).toBe(false);
    expect(isFingerprint(fp.slice(1))).toBe(false);
    expect(isFingerprint("@sample_trader")).toBe(false);
    expect(isFingerprint(undefined)).toBe(false);
  });
});
