import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRACT_TESTS, CONTRACT_UNIT_TESTS, TESTNET_CHECKS } from "@/lib/repo-facts";

const readme = readFileSync("../README.md", "utf8");
/** The README's table row for one part of the repository. */
const row = (where: string) => readme.split("\n").find((line) => line.startsWith("|") && line.includes(`\`${where}\``)) ?? "";

describe("the test counts the pages state", () => {
  it("are the ones the README reports for each contract", () => {
    expect(row("contracts/proof")).toContain(`${CONTRACT_TESTS.proof} unit tests pass`);
    expect(row("contracts/card")).toContain(`${CONTRACT_TESTS.card} unit tests pass`);
    expect(row("contracts/check")).toContain(`${CONTRACT_TESTS.check} unit tests pass`);
    expect(CONTRACT_UNIT_TESTS).toBe(58);
  });

  it("count the checks the end-to-end script runs on testnet", () => {
    expect(readme).toContain(`checks ${TESTNET_CHECKS} things for real`);
  });
});
