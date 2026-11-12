// Checks every claim in EVIDENCE.md against NEAR itself, so nobody has to take the README's word for it. Each claim is
// one free read of a contract (no account, no key); what it expects is in evidence-claims.json, the same file the
// table in EVIDENCE.md is made from. Prints a line per claim and ends "N of N match". Exits 1 if any doesn't.
//
// Run: node scripts/evidence.mjs            check every claim on NEAR testnet
//      node scripts/evidence.mjs --table    print EVIDENCE.md's table
import { readFileSync } from "node:fs";
import { callOf, holds, table } from "./evidence-lib.mjs";
import { view as read } from "./near-read.mjs";

const file = JSON.parse(readFileSync(new URL("./evidence-claims.json", import.meta.url), "utf8"));
if (process.argv.includes("--table")) {
  console.log(table(file));
  process.exit(0);
}

/** One free read of a contract, from a block NEAR has finalised. Throws when NEAR doesn't answer. */
const view = (contractId, method, args) => read(contractId, method, args, { rpcUrl: file.rpc, finality: "final", timeoutMs: 20_000 });

let matched = 0;
console.log(`Checking ${file.claims.length} claims on NEAR ${file.network} (${file.rpc})\n`);
for (const [i, claim] of file.claims.entries()) {
  let answer, failed = null;
  try {
    answer = await view(file.contracts[claim.contract], claim.method, claim.args);
  } catch (err) {
    failed = err?.message ?? String(err);
  }
  const ok = !failed && holds(answer, claim.test);
  if (ok) matched++;
  console.log(`${ok ? "match   " : "NO MATCH"}  ${i + 1}. ${claim.claim}`);
  console.log(`          asked: ${callOf(claim, file.contracts)}`);
  if (!ok) console.log(`          expected: ${claim.expect}\n          NEAR ${failed ? `didn't answer (${failed})` : `answered: ${JSON.stringify(answer).slice(0, 300)}`}`);
}
console.log(`\n${matched} of ${file.claims.length} match`);
process.exit(matched === file.claims.length ? 0 : 1);
