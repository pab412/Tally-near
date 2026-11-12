import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { callOf, holds, table } from "../scripts/evidence-lib.mjs";

const file = JSON.parse(readFileSync("scripts/evidence-claims.json", "utf8"));
const evidence = readFileSync("../EVIDENCE.md", "utf8");
const sampleFingerprint = (letter: string) => createHash("sha256").update(readFileSync(`public/samples/sample-card-${letter}.png`)).digest("hex");

describe("what counts as a match", () => {
  const record = { fingerprint: "f", latest: { verdict: "Real", check_id: "k1", recorded_at_ms: 5 }, entries: 2 };

  it("a part of the answer is exactly what was expected", () => {
    expect(holds(record, { at: "latest.verdict", equals: "Real" })).toBe(true);
    expect(holds(record, { at: "latest.verdict", equals: "Fake" })).toBe(false);
    expect(holds("notpab.testnet", { equals: "notpab.testnet" })).toBe(true);
    expect(holds(null, { at: "latest.verdict", equals: "Real" }), "no record is never a match for a verdict").toBe(false);
  });

  it("a count is at least a number, as a number or as the string NEAR gives", () => {
    expect([holds(3, { atLeast: 3 }), holds("12", { atLeast: 3 }), holds(2, { atLeast: 3 }), holds(null, { atLeast: 0 }), holds("many", { atLeast: 0 })]).toEqual([true, true, false, false, false]);
  });

  it("nothing is only ever null", () => {
    expect([holds(null, { isNull: true }), holds(record, { isNull: true }), holds(undefined, { isNull: true })]).toEqual([true, false, false]);
  });

  it("an object holds exactly the named fields, so nothing else is stored beside them", () => {
    expect(holds(record, { keys: ["entries", "fingerprint", "latest"] })).toBe(true);
    expect(holds({ ...record, handle: "@someone" }, { keys: ["entries", "fingerprint", "latest"] }), "a name beside the record is not a match").toBe(false);
    expect(holds(record, { at: "latest", keys: ["verdict", "check_id", "recorded_at_ms"] })).toBe(true);
  });

  it("a history is its entries in order", () => {
    const history = [{ verdict: "Fake" }, { verdict: "Real" }];
    expect(holds(history, { each: "verdict", equals: ["Fake", "Real"] })).toBe(true);
    expect(holds(history, { each: "verdict", equals: ["Real", "Fake"] })).toBe(false);
  });

  it("every part of a claim has to hold, and a test that says nothing never does", () => {
    expect(holds(record, { all: [{ at: "latest.verdict", equals: "Real" }, { at: "entries", equals: 2 }] })).toBe(true);
    expect(holds(record, { all: [{ at: "latest.verdict", equals: "Real" }, { at: "entries", equals: 1 }] })).toBe(false);
    expect(holds(record, {})).toBe(false);
  });
});

describe("the claims file", () => {
  it("has a contract, a method, a test and words for every claim", () => {
    expect(file.claims.length).toBeGreaterThan(0);
    for (const c of file.claims) {
      expect(file.contracts[c.contract], c.claim).toMatch(/\.testnet$/);
      expect(typeof c.method === "string" && typeof c.expect === "string" && c.claim.endsWith("."), c.claim).toBe(true);
      expect(holds(undefined, c.test), `${c.claim}: no answer must never match`).toBe(false);
    }
  });

  it("names the sample cards by the fingerprints of the files in this repository", () => {
    const used = JSON.stringify(file.claims);
    for (const letter of ["a", "b", "c"]) expect(used, `sample card ${letter}`).toContain(sampleFingerprint(letter));
  });

  it("puts nothing in a claim but a fingerprint: no name, no handle", () => {
    for (const c of file.claims) for (const v of Object.values(c.args)) expect(v, c.claim).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("EVIDENCE.md", () => {
  it("shows the very table the claims file makes, and says how many there are", () => {
    const shown = evidence.slice(evidence.indexOf("<!-- claims:start -->") + "<!-- claims:start -->".length, evidence.indexOf("<!-- claims:end -->")).trim();
    expect(shown).toBe(table(file));
    expect(evidence).toContain(`\`${file.claims.length} of ${file.claims.length} match\``);
  });

  it("writes each call the way the script prints it", () => {
    expect(callOf(file.claims[0], file.contracts)).toBe("proof.notpab.testnet cards");
    expect(callOf({ contract: "proof", method: "get", args: { fingerprint: "ab" } }, file.contracts)).toBe('proof.notpab.testnet get {"fingerprint":"ab"}');
  });
});
