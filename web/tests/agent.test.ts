import { describe, expect, it } from "vitest";
import { DOES, decide, inNear } from "../scripts/agent-rule.mjs";

const AT = Date.UTC(2026, 10, 10, 22, 4);
const answer = (verdict: "Real" | "Unclear" | "Fake", o: { held_by?: string | null; entries?: number } = {}) => ({
  record: { latest: { verdict, check_id: "sample-b1", recorded_at_ms: AT }, entries: o.entries ?? 1 },
  held_by: o.held_by ?? null,
});

describe("Tally's rule: allow, warn or block, with reasons from the record", () => {
  it("Real: allow", () => {
    expect(decide(answer("Real"))).toEqual({ decision: "allow", reasons: ["NEAR says Real", "check sample-b1, recorded 2026-11-10", "1 entry, never corrected"] });
    expect(decide(answer("Real", { held_by: "trader.testnet", entries: 2 })).reasons).toEqual([
      "NEAR says Real",
      "check sample-b1, recorded 2026-11-10",
      "2 entries: the verdict was corrected once",
      "trader.testnet holds its verified card",
    ]);
  });

  it("Unclear: warn, so the agent stops and asks its owner", () => {
    expect(decide(answer("Unclear"))).toMatchObject({ decision: "warn", reasons: ["NEAR says Unclear", "check sample-b1, recorded 2026-11-10", "1 entry, never corrected"] });
  });

  it("Fake: block, whoever still holds a verified card for it", () => {
    expect(decide(answer("Fake", { entries: 4 }))).toEqual({ decision: "block", reasons: ["NEAR says Fake", "check sample-b1, recorded 2026-11-10", "4 entries: the verdict was corrected 3 times"] });
    expect(decide(answer("Fake", { held_by: "trader.testnet" })).decision, "a verified card not burned yet doesn't make a Fake card safe").toBe("block");
  });

  it("no record: block (a card Tally never checked is not a card to act on)", () => {
    expect(decide({ record: null, held_by: null })).toEqual({ decision: "block", reasons: ["no record on NEAR: Tally has never checked this card"] });
  });

  it("the registry not answering: block", () => {
    expect(decide(null)).toEqual({ decision: "block", reasons: ["the registry on NEAR didn't answer, so nothing is known about this card"] });
  });

  it("takes its reasons from the record alone: a record with less in it says less, never something made up", () => {
    expect(decide({ record: { latest: { verdict: "Real" } }, held_by: null })).toEqual({ decision: "allow", reasons: ["NEAR says Real"] });
  });

  it("says what an agent does on each answer: only allow goes ahead", () => {
    expect(DOES).toEqual({ allow: "ALLOW: goes ahead", warn: "WARN: stops and asks its owner", block: "BLOCK: refuses" });
  });

  it("shows amounts in NEAR exactly, never rounded", () => {
    expect(inNear("10000000000000000000000")).toBe("0.01");
    expect(inNear("5000000000000000000001")).toBe("0.005000000000000000000001");
    expect(inNear(BigInt("3000000000000000000000000"))).toBe("3");
    expect(inNear("0")).toBe("0");
    expect(inNear("1")).toBe("0.000000000000000000000001");
  });
});
