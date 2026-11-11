import { describe, expect, it } from "vitest";
import { decide, inNear } from "../scripts/agent-rule.mjs";

const answer = (verdict: "Real" | "Unclear" | "Fake", held_by: string | null = null) => ({ record: { latest: { verdict } }, held_by });

describe("the demo agent's rule", () => {
  it("copies a trader only when NEAR says their card is Real", () => {
    expect(decide(answer("Real"))).toEqual({ copy: true, why: "NEAR says Real" });
    expect(decide(answer("Real", "trader.testnet"))).toEqual({ copy: true, why: "NEAR says Real, and trader.testnet holds its verified card" });
    expect(decide(answer("Unclear"))).toEqual({ copy: false, why: "NEAR says Unclear" });
    expect(decide(answer("Fake"))).toEqual({ copy: false, why: "NEAR says Fake" });
  });

  it("doesn't copy a trader whose card Tally never checked", () => {
    expect(decide({ record: null, held_by: null })).toEqual({ copy: false, why: "Tally has never checked this card" });
  });

  it("shows amounts in NEAR exactly, never rounded", () => {
    expect(inNear("10000000000000000000000")).toBe("0.01");
    expect(inNear("5000000000000000000001")).toBe("0.005000000000000000000001");
    expect(inNear(BigInt("3000000000000000000000000"))).toBe("3");
    expect(inNear("0")).toBe("0");
    expect(inNear("1")).toBe("0.000000000000000000000001");
  });
});
