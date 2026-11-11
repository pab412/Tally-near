import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { badgeFor, type BadgeReads } from "@/lib/badge";
import { badgePath } from "@/lib/fingerprint";
import type { ProofRecord, Verdict, VerifiedCard } from "@/lib/near";
import { sampleFingerprints, samplePicture } from "@/lib/sample";

const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const AT = Date.UTC(2026, 10, 10, 22, 4);

const card: VerifiedCard = { fingerprint: FP, holder: "trader.testnet", mintedAtMs: AT + 5_000, checkId: "k3x9q2", holdsYocto: "0" };
const says = (verdict: Verdict): ProofRecord => ({ fingerprint: FP, latest: { verdict, check_id: "k3x9q2", recorded_at_ms: AT }, entries: 1 });

/** The two contracts as the picture link reads them: what the card contract holds, and what the registry says. */
function near(held: VerifiedCard | null, record: ProofRecord | null): BadgeReads & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    verifiedCard: async (fp) => (asked.push(`card:${fp}`), held),
    latestRecord: async (fp) => (asked.push(`registry:${fp}`), record),
  };
}

describe("a verified card's picture link", () => {
  it("is drawn for a card that is held and still Real, dated by the registry", async () => {
    const reads = near(card, says("Real"));
    expect(await badgeFor(`${FP}.png`, reads)).toEqual({ ok: true, fingerprint: FP, recordedAtMs: AT });
    expect(reads.asked.sort()).toEqual([`card:${FP}`, `registry:${FP}`]);
  });

  it("isn't drawn for a card that has no verified card", async () => {
    expect(await badgeFor(`${FP}.png`, near(null, says("Real")))).toMatchObject({ ok: false, status: 404 });
  });

  it("stops being drawn the moment the verdict is corrected, before anyone asks the contract to burn it", async () => {
    for (const verdict of ["Fake", "Unclear"] as const) {
      expect(await badgeFor(`${FP}.png`, near(card, says(verdict)))).toEqual({
        ok: false,
        status: 404,
        message: "This card's verdict was corrected, so its verified card no longer stands.",
      });
    }
    expect(await badgeFor(`${FP}.png`, near(card, null))).toMatchObject({ ok: false, status: 404 });
  });

  it("only answers the link the contract gives out, and never asks NEAR about anything else", async () => {
    for (const file of [FP, `${FP}.jpg`, "trader.testnet.png", `${FP.toUpperCase()}.png`, `../${FP}.png`, ".png"]) {
      const reads = near(card, says("Real"));
      expect(await badgeFor(file, reads), file).toMatchObject({ ok: false, status: 404 });
      expect(reads.asked, file).toEqual([]);
    }
  });

  it("is the link the card contract gives every token", async () => {
    const contract = readFileSync(new URL("../../contracts/card/src/lib.rs", import.meta.url), "utf8");
    expect(contract).toContain('media: Some(format!("badge/{fingerprint}.png"))');
    expect(badgePath(FP)).toBe(`/badge/${FP}.png`);
    expect(await badgeFor(badgePath(FP).split("/").pop()!, near(card, says("Real")))).toMatchObject({ ok: true });
  });

  it("says NEAR couldn't be reached rather than guess", async () => {
    const down: BadgeReads = { verifiedCard: async () => card, latestRecord: () => Promise.reject(new Error("timeout")) };
    expect(await badgeFor(`${FP}.png`, down)).toMatchObject({ ok: false, status: 502 });
  });
});

describe("the pictures the site holds", () => {
  it("finds its own sample cards by fingerprint, with their size", () => {
    const { fingerprint, oneByteChanged } = sampleFingerprints("sample-card-b.png");
    const picture = samplePicture(fingerprint);
    expect(picture && [picture.width, picture.height]).toEqual([1600, 900]);
    expect(picture?.png.subarray(1, 4).toString()).toBe("PNG");
    expect(samplePicture(oneByteChanged), "an edited copy isn't the sample").toBeNull();
  });

  it("has no picture of any other card", () => {
    expect(samplePicture(FP)).toBeNull();
  });
});
