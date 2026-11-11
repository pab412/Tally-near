// The demo agent's one rule, and how it shows an amount. Kept apart from the script that spends money so it can be
// tested on its own (tests/agent.test.ts).

/**
 * Whether to copy a trader, from what the paid check answered about their card.
 * @param {{ record: { latest: { verdict: "Real" | "Unclear" | "Fake" } } | null, held_by: string | null }} answer
 * @returns {{ copy: boolean, why: string }}
 */
export function decide(answer) {
  if (!answer.record) return { copy: false, why: "Tally has never checked this card" };
  const { verdict } = answer.record.latest;
  if (verdict !== "Real") return { copy: false, why: `NEAR says ${verdict}` };
  return { copy: true, why: answer.held_by ? `NEAR says Real, and ${answer.held_by} holds its verified card` : "NEAR says Real" };
}

/**
 * yoctoNEAR as NEAR, with no rounding: "5000000000000000000000" becomes "0.005".
 * @param {string | bigint} yocto
 */
export function inNear(yocto) {
  const digits = BigInt(yocto).toString().padStart(25, "0");
  const whole = digits.slice(0, -24), part = digits.slice(-24).replace(/0+$/, "");
  return part ? `${whole}.${part}` : whole;
}
