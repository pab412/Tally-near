// Tally's rule for acting on a check (allow, warn or block), and how an amount is shown. Kept apart from the script
// that spends money so it can be tested on its own (tests/agent.test.ts) and used by the site.

/**
 * The rule every Tally check answers by, in one place (the demo agent, the site and SKILL.md all use it; the contracts'
 * copy is `decide` in contracts/types):
 *
 *   NEAR says                 answer   what an agent does
 *   Real                      allow    goes ahead
 *   Unclear                   warn     stops and asks its owner
 *   Fake                      block    refuses
 *   no record                 block    refuses
 *   the registry not answering block   refuses
 *
 * The reasons come from the record itself, never made up: the verdict, the check's id and date, how many entries the
 * card has (more than one means it was corrected), and who holds its verified card.
 *
 * @param {{ record: { latest: { verdict: "Real" | "Unclear" | "Fake", check_id?: string, recorded_at_ms?: number }, entries?: number } | null, held_by?: string | null } | null} answer
 *   what NEAR answered about the card; null when the registry didn't answer at all
 * @returns {{ decision: "allow" | "warn" | "block", reasons: string[] }}
 */
export function decide(answer) {
  if (!answer) return { decision: "block", reasons: ["the registry on NEAR didn't answer, so nothing is known about this card"] };
  if (!answer.record) return { decision: "block", reasons: ["no record on NEAR: Tally has never checked this card"] };
  const { latest, entries } = answer.record;
  const reasons = [`NEAR says ${latest.verdict}`];
  if (latest.check_id) reasons.push(`check ${latest.check_id}${latest.recorded_at_ms ? `, recorded ${new Date(latest.recorded_at_ms).toISOString().slice(0, 10)}` : ""}`);
  if (entries) reasons.push(entries === 1 ? "1 entry, never corrected" : `${entries} entries: the verdict was corrected ${entries === 2 ? "once" : `${entries - 1} times`}`);
  if (answer.held_by) reasons.push(`${answer.held_by} holds its verified card`);
  const decision = latest.verdict === "Real" ? "allow" : latest.verdict === "Unclear" ? "warn" : "block";
  return { decision, reasons };
}

/** The three answers, with what an agent does on each. */
export const DOES = { allow: "ALLOW: goes ahead", warn: "WARN: stops and asks its owner", block: "BLOCK: refuses" };

/**
 * yoctoNEAR as NEAR, with no rounding: "5000000000000000000000" becomes "0.005".
 * @param {string | bigint} yocto
 */
export function inNear(yocto) {
  const digits = BigInt(yocto).toString().padStart(25, "0");
  const whole = digits.slice(0, -24), part = digits.slice(-24).replace(/0+$/, "");
  return part ? `${whole}.${part}` : whole;
}
