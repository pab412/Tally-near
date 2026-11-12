// What the evidence script does with a claim (evidence.mjs, EVIDENCE.md), kept apart from the part that asks NEAR so
// it can be tested on its own (tests/evidence.test.ts).

const at = (value, path) => (path ? path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), value) : value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Whether what NEAR answered is what the claim expects. A test is one of:
 *   { equals }            the answer (or the part at `at`) is exactly this
 *   { atLeast }           a number, or a number in a string, no smaller than this
 *   { isNull: true }      NEAR answered nothing: no record, no token
 *   { keys }              an object with exactly these fields, so nothing else is stored beside them
 *   { each, equals }      a list: this field of every entry, in order
 *   { all: [tests] }      every one of them
 * `at` picks a part of the answer first ("latest.verdict").
 * @param {unknown} answer
 * @param {Record<string, unknown>} test
 * @returns {boolean}
 */
export function holds(answer, test) {
  if (Array.isArray(test.all)) return test.all.every((t) => holds(answer, t));
  const part = at(answer, typeof test.at === "string" ? test.at : "");
  if (test.isNull) return part === null;
  if ("atLeast" in test) return part != null && /^\d+$/.test(String(part)) && BigInt(String(part)) >= BigInt(String(test.atLeast));
  if (Array.isArray(test.keys)) return !!part && typeof part === "object" && !Array.isArray(part) && same(Object.keys(part).sort(), [...test.keys].sort());
  if (typeof test.each === "string") return Array.isArray(part) && same(part.map((entry) => entry?.[test.each]), test.equals);
  if ("equals" in test) return same(part, test.equals);
  return false; // a test that says nothing can't be met
}

/** The call a claim makes, as a line: proof.notpab.testnet get {"fingerprint":"…"}. */
export function callOf(claim, contracts) {
  const args = Object.keys(claim.args ?? {}).length ? ` ${JSON.stringify(claim.args)}` : "";
  return `${contracts[claim.contract]} ${claim.method}${args}`;
}

/** EVIDENCE.md's table, from the same claims the script checks. */
export function table({ claims, contracts }) {
  const cell = (text) => String(text).replace(/\|/g, "\\|");
  return [
    "| # | Claim | Asked of NEAR | Expected answer |",
    "|---|---|---|---|",
    ...claims.map((c, i) => `| ${i + 1} | ${cell(c.claim)} | \`${cell(callOf(c, contracts))}\` | ${cell(c.expect)} |`),
  ].join("\n");
}
