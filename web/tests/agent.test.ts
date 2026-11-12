import { describe, expect, it } from "vitest";
import { ACTION, decide, inNear } from "../scripts/agent-rule.mjs";

const answer = (verdict: "Real" | "Unclear" | "Fake", held_by: string | null = null) => ({ record: { latest: { verdict } }, held_by });

describe("the demo agent's rule", () => {
  it("allows a copy only when NEAR says the card is Real, and blocks a Fake one", () => {
    expect(decide(answer("Real"))).toEqual({ action: "allow", copy: true, why: "NEAR says Real" });
    expect(decide(answer("Real", "trader.testnet"))).toEqual({ action: "allow", copy: true, why: "NEAR says Real, and trader.testnet holds its verified card" });
    expect(decide(answer("Fake"))).toEqual({ action: "block", copy: false, why: "NEAR says Fake" });
    expect(decide(answer("Fake", "trader.testnet")), "a verified card not burned yet doesn't make a Fake card safe").toMatchObject({ action: "block", copy: false });
  });

  it("warns and asks its owner when nobody knows: an Unclear card, or one Tally never checked", () => {
    expect(decide(answer("Unclear"))).toEqual({ action: "warn", copy: false, why: "NEAR says Unclear" });
    expect(decide({ record: null, held_by: null })).toEqual({ action: "warn", copy: false, why: "Tally has never checked this card" });
  });

  it("says what it does in words that can't be misread: only allow copies", () => {
    expect(ACTION).toEqual({ allow: "ALLOW: COPY", warn: "WARN: ASK THE OWNER, DON'T COPY", block: "BLOCK: DON'T COPY" });
  });

  it("shows amounts in NEAR exactly, never rounded", () => {
    expect(inNear("10000000000000000000000")).toBe("0.01");
    expect(inNear("5000000000000000000001")).toBe("0.005000000000000000000001");
    expect(inNear(BigInt("3000000000000000000000000"))).toBe("3");
    expect(inNear("0")).toBe("0");
    expect(inNear("1")).toBe("0.000000000000000000000001");
  });
});
