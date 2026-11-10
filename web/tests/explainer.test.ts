import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isFingerprint } from "@/lib/fingerprint";
import { sampleFingerprints } from "@/lib/sample";

describe("the explainer's example fingerprints", () => {
  it("are computed from the sample card's real bytes, not typed in", () => {
    const { fingerprint, oneByteChanged } = sampleFingerprints("sample-card-b.png");
    expect(fingerprint).toBe(createHash("sha256").update(readFileSync("public/samples/sample-card-b.png")).digest("hex"));
    expect(isFingerprint(fingerprint) && isFingerprint(oneByteChanged)).toBe(true);
  });

  it("show that one changed byte gives a completely different fingerprint", () => {
    const { fingerprint, oneByteChanged } = sampleFingerprints("sample-card-b.png");
    const same = [...fingerprint].filter((c, i) => c === oneByteChanged[i]).length;
    expect(oneByteChanged).not.toBe(fingerprint);
    expect(same).toBeLessThan(16); // two unrelated hashes share about 4 of 64 characters by chance
  });
});
