// Tests for the MCP server's tools (tools.mjs), with NEAR faked: what each tool answers, that a registry that can't
// be reached is a block and never a yes, and that nothing but a fingerprint is ever sent. Run: npm test
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cardHistory, checkCard, fingerprintFile, inWords, WHERE } from "./tools.mjs";

const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const entry = (verdict, check_id = "sample-1") => ({ verdict, check_id, recorded_at_ms: 1_794_000_000_000 });
const record = (verdict, entries = 1) => ({ fingerprint: FP, latest: entry(verdict), entries });

/** A NEAR node that answers each contract method with what the test gives it, and remembers what it was asked. */
function near(answers) {
  const asked = [];
  const fetch = async (url, init) => {
    const { params } = JSON.parse(init.body);
    asked.push({ url, contract: params.account_id, method: params.method_name, args: JSON.parse(atob(params.args_base64)) });
    const answer = answers[params.method_name];
    if (answer === undefined) return new Response("down", { status: 503 });
    return Response.json({ result: { result: [...new TextEncoder().encode(JSON.stringify(answer))] } });
  };
  return { fetch, asked };
}

test("check_card: a Real card is allow, with the reasons from its record and who holds its verified card", async () => {
  const node = near({ get: record("Real"), nft_token: { token_id: FP, owner_id: "trader.testnet" } });
  const a = await checkCard(FP, node);
  assert.deepEqual(
    { decision: a.decision, does: a.does, verdict: a.verdict, reasons: a.reasons, held_by: a.held_by, entries: a.entries },
    { decision: "allow", does: "ALLOW: goes ahead", verdict: "Real", reasons: ["NEAR says Real", "check sample-1, recorded 2026-11-06", "1 entry, never corrected", "trader.testnet holds its verified card"], held_by: "trader.testnet", entries: 1 },
  );
  assert.equal("history" in a, false, "a card never corrected has no history to list");
});

test("check_card: Unclear is warn, Fake is block, and a card Tally never checked is block", async () => {
  assert.equal((await checkCard(FP, near({ get: record("Unclear"), nft_token: null }))).decision, "warn");
  assert.equal((await checkCard(FP, near({ get: record("Fake"), nft_token: null }))).decision, "block");
  const none = await checkCard(FP, near({ get: null }));
  assert.deepEqual([none.decision, none.verdict, none.reasons], ["block", null, ["no record on NEAR: Tally has never checked this card"]]);
});

test("check_card: a registry that doesn't answer is a block, not an error and never a yes", async () => {
  const a = await checkCard(FP, near({}));
  assert.deepEqual([a.decision, a.reasons], ["block", ["the registry on NEAR didn't answer, so nothing is known about this card"]]);
});

test("check_card: a corrected card says so, with every verdict it has had, oldest first", async () => {
  const node = near({ get: record("Real", 2), nft_token: null, history: [entry("Fake", "sample-a"), entry("Real", "sample-a-appeal")] });
  const a = await checkCard(FP, node);
  assert.deepEqual([a.decision, a.history, a.entries], ["allow", ["Fake", "Real"], 2]);
  assert.match(inWords.check_card(a), /^ALLOW: goes ahead\. NEAR says Real; .*2 entries: the verdict was corrected once\. Its verdicts, oldest first: Fake, then Real\./);
});

test("check_card: asks the registry and the card contract, and sends nothing but the fingerprint", async () => {
  const node = near({ get: record("Real"), nft_token: null });
  await checkCard(FP, node);
  assert.deepEqual(node.asked, [
    { url: WHERE.rpcUrl, contract: WHERE.registry, method: "get", args: { fingerprint: FP } },
    { url: WHERE.rpcUrl, contract: WHERE.cards, method: "nft_token", args: { token_id: FP } },
  ]);
});

test("card_history: every entry, oldest first, and an empty list for a card never checked", async () => {
  const a = await cardHistory(FP, near({ history: [entry("Fake", "sample-a"), entry("Real", "sample-a-appeal")] }));
  assert.deepEqual(a.entries, [
    { verdict: "Fake", check_id: "sample-a", recorded: "2026-11-06", recorded_at_ms: 1_794_000_000_000 },
    { verdict: "Real", check_id: "sample-a-appeal", recorded: "2026-11-06", recorded_at_ms: 1_794_000_000_000 },
  ]);
  assert.equal(inWords.card_history(a), "2 entries, oldest first: Fake (check sample-a, 2026-11-06), then Real (check sample-a-appeal, 2026-11-06). The last one stands.");
  assert.equal(inWords.card_history(await cardHistory(FP, near({ history: [] }))), "No record: Tally has never checked this card.");
});

test("card_history: says so when the registry doesn't answer, and to treat that as a block", async () => {
  await assert.rejects(cardHistory(FP, near({})), /didn't answer.*block/);
});

test("a name, a handle or a link is not a fingerprint: refused before NEAR is asked", async () => {
  const node = near({ get: record("Real") });
  for (const bad of ["@sample_trader", "https://x.com/sample", FP.toUpperCase(), FP.slice(1), "", undefined]) {
    await assert.rejects(checkCard(bad, node), /isn't a card fingerprint/);
    await assert.rejects(cardHistory(bad, node), /isn't a card fingerprint/);
  }
  assert.equal(node.asked.length, 0);
});

test("fingerprint_file: the SHA-256 of the file's exact bytes, the same fingerprint the site makes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tally-mcp-"));
  const file = join(dir, "card.png");
  writeFileSync(file, "SAMPLE card");
  assert.deepEqual(await fingerprintFile(file), { fingerprint: createHash("sha256").update("SAMPLE card").digest("hex"), bytes: 11 });
  writeFileSync(file, "SAMPLE card.");
  assert.notEqual((await fingerprintFile(file)).fingerprint, createHash("sha256").update("SAMPLE card").digest("hex"), "one more byte, another fingerprint");
  await assert.rejects(fingerprintFile(join(dir, "missing.png")), /no file at that path/);
  await assert.rejects(fingerprintFile(dir), /no file at that path/);
});

test("it reads Tally's own contracts on NEAR testnet unless told otherwise", () => {
  assert.deepEqual(WHERE, { network: "testnet", rpcUrl: "https://rpc.testnet.fastnear.com", registry: "proof.notpab.testnet", cards: "card.notpab.testnet" });
});
