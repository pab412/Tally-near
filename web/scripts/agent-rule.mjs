// The demo agent's one rule, and how it shows an amount. Kept apart from the script that spends money so it can be
// tested on its own (tests/agent.test.ts).

/**
 * What the agent does about a trader, from what the paid check answered about their card:
 *   allow: the card is Real, so it copies;
 *   block: the card is Fake, so it doesn't, whatever it is told;
 *   warn:  nobody knows (Unclear, or Tally never checked the card), so it doesn't act on its own and asks its owner.
 * It only ever copies on allow.
 * @param {{ record: { latest: { verdict: "Real" | "Unclear" | "Fake" } } | null, held_by: string | null }} answer
 * @returns {{ action: "allow" | "warn" | "block", copy: boolean, why: string }}
 */
export function decide(answer) {
  if (!answer.record) return { action: "warn", copy: false, why: "Tally has never checked this card" };
  const { verdict } = answer.record.latest;
  if (verdict === "Fake") return { action: "block", copy: false, why: "NEAR says Fake" };
  if (verdict !== "Real") return { action: "warn", copy: false, why: `NEAR says ${verdict}` };
  return { action: "allow", copy: true, why: answer.held_by ? `NEAR says Real, and ${answer.held_by} holds its verified card` : "NEAR says Real" };
}

/** What the agent prints for each action. */
export const ACTION = { allow: "ALLOW: COPY", warn: "WARN: ASK THE OWNER, DON'T COPY", block: "BLOCK: DON'T COPY" };

/**
 * yoctoNEAR as NEAR, with no rounding: "5000000000000000000000" becomes "0.005".
 * @param {string | bigint} yocto
 */
export function inNear(yocto) {
  const digits = BigInt(yocto).toString().padStart(25, "0");
  const whole = digits.slice(0, -24), part = digits.slice(-24).replace(/0+$/, "");
  return part ? `${whole}.${part}` : whole;
}
