// End-to-end test of both contracts on NEAR testnet: the one thing unit tests can't cover, the card contract asking
// the proof registry before it mints or keeps a card. It creates two sub-accounts of the account you give it, deploys
// the contracts there and runs the whole flow for real.
//
// Run: node scripts/e2e-contracts.mjs <account.json> <tally_proof.wasm> <tally_card.wasm>
//   account.json: {"id":"<you>.testnet","pub":"ed25519:...","key":"ed25519:..."} for a THROWAWAY testnet account with
//   about 5 NEAR. Never a real key. Build the .wasm files with cargo-near (README, "Build and deploy").
//   TAG=x picks the sub-account names (proofx.<you>, cardx.<you>). MODE=redeploy puts new code on accounts an earlier
//   run made; MODE=skip only runs the checks.
import { Account, JsonRpcProvider, KeyPairSigner, getTransactionLastResult, teraToGas, nearToYocto } from "near-api-js";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const [, , acctFile, proofWasm, cardWasm] = process.argv;
if (!acctFile || !proofWasm || !cardWasm) {
  console.error("Run: node scripts/e2e-contracts.mjs <account.json> <tally_proof.wasm> <tally_card.wasm>");
  process.exit(2);
}
const root = JSON.parse(readFileSync(acctFile, "utf8"));
if (!root.id.endsWith(".testnet")) {
  console.error("This test only runs on NEAR testnet.");
  process.exit(2);
}
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" });
const signer = KeyPairSigner.fromSecretKey(root.key);
const acct = (id) => new Account(id, provider, signer);
const R = acct(root.id);
const tag = process.env.TAG || Date.now().toString(36).slice(-5);
const PROOF = `proof${tag}.${root.id}`, CARD = `card${tag}.${root.id}`;
const fp = () => createHash("sha256").update(randomBytes(32)).digest("hex");
const gasOf = (o) => ((o.transaction_outcome.outcome.gas_burnt + o.receipts_outcome.reduce((s, r) => s + r.outcome.gas_burnt, 0)) / 1e12).toFixed(1) + " Tgas";
const view = async (contractId, method, args = {}) => {
  const r = await provider.callFunctionRaw({ contractId, method, args, blockQuery: { finality: "optimistic" } });
  return JSON.parse(Buffer.from(r.result).toString());
};
let failed = 0;
const ok = (what, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${what}${extra ? "  " + extra : ""}`); if (!cond) failed++; };
/** Runs a call that must fail and answers the failure text. */
const mustFail = async (what, want, call) => {
  try { const o = await call(); ok(what, false, "it went through: " + JSON.stringify(getTransactionLastResult(o)).slice(0, 120)); }
  catch (e) { const m = String(e?.message || e) + " " + JSON.stringify(e?.context ?? e?.cause ?? "").slice(0, 600); ok(what, m.includes(want), m.includes(want) ? "" : m.slice(0, 400)); }
};
const call = (who, contractId, methodName, args, { gas = 100, deposit = 0n } = {}) =>
  who.callFunctionRaw({ contractId, methodName, args, gas: teraToGas(gas), deposit });

const mode = process.env.MODE || "create"; // create | redeploy (new code, same state) | skip
if (mode !== "skip") {
  for (const [id, wasm, near, init] of [[PROOF, proofWasm, "1.8", { attester: root.id }], [CARD, cardWasm, "2.6", { attester: root.id, registry: PROOF }]]) {
    if (mode === "create") await R.createSubAccount({ accountOrPrefix: id, publicKey: root.pub, nearToTransfer: nearToYocto(near) });
    const d = await acct(id).deployContract(readFileSync(wasm));
    console.log("deployed", id, readFileSync(wasm).length, "bytes", gasOf(d));
    if (mode === "create") await call(acct(id), id, "new", init);
  }
}
ok("the card contract knows its registry", (await view(CARD, "registry")) === PROOF);

const A = fp(), B = fp(), C = fp();
await call(R, PROOF, "record", { fingerprint: A, verdict: "Real", check_id: "e2e-a" });
await call(R, PROOF, "record", { fingerprint: B, verdict: "Fake", check_id: "e2e-b" });

const m = await call(R, CARD, "mint", { fingerprint: A, owner: root.id });
const token = getTransactionLastResult(m);
ok("a Real card is minted after the contract asked the registry", token?.token_id === A && token?.owner_id === root.id, gasOf(m));
ok("its metadata names the check", token?.metadata?.extra === JSON.stringify({ check_id: "e2e-a", registry: PROOF }), token?.metadata?.extra);
ok("the mint logged the standard event", JSON.stringify(m.receipts_outcome.map((r) => r.outcome.logs)).includes("nft_mint"));

await mustFail("a Fake card can't be minted", "Only a card the proof registry says is Real", () => call(R, CARD, "mint", { fingerprint: B, owner: root.id }));
await mustFail("a card Tally never checked can't be minted", "Tally hasn't checked this card", () => call(R, CARD, "mint", { fingerprint: C, owner: root.id }));
await mustFail("the same card can't be minted twice", "already has its verified card", () => call(R, CARD, "mint", { fingerprint: A, owner: root.id }));
await mustFail("nobody can fake the registry's answer", "private", () =>
  call(R, CARD, "on_mint_checked", { fingerprint: B, owner: root.id }));
await mustFail("someone who isn't the attester can't mint", "Only Tally's attester", () => call(acct(PROOF), CARD, "mint", { fingerprint: A, owner: PROOF }));
await mustFail("it can't be transferred", "can't be transferred", () =>
  call(R, CARD, "nft_transfer", { receiver_id: PROOF, token_id: A }, { deposit: 1n }));

ok("nft_token shows it", (await view(CARD, "nft_token", { token_id: A }))?.owner_id === root.id);
ok("nft_tokens_for_owner lists it", (await view(CARD, "nft_tokens_for_owner", { account_id: root.id })).some((t) => t.token_id === A));
ok("nft_metadata follows the standard", (await view(CARD, "nft_metadata")).spec === "nft-1.0.0");

const r1 = await call(acct(PROOF), CARD, "recheck", { fingerprint: A }); // anyone may ask
ok("a recheck keeps a card that is still Real", getTransactionLastResult(r1) === true, gasOf(r1));
await call(R, PROOF, "record", { fingerprint: A, verdict: "Fake", check_id: "e2e-a-corrected" });
const r2 = await call(acct(PROOF), CARD, "recheck", { fingerprint: A });
ok("a recheck burns a card whose verdict was corrected", getTransactionLastResult(r2) === false, gasOf(r2));
ok("the burn logged the standard event", JSON.stringify(r2.receipts_outcome.map((r) => r.outcome.logs)).includes("nft_burn"));
ok("the card is gone", (await view(CARD, "nft_token", { token_id: A })) === null && (await view(CARD, "nft_total_supply")) === "0");

// with only the gas the demo page attaches
await call(R, PROOF, "record", { fingerprint: C, verdict: "Real", check_id: "e2e-c" });
const m2 = await call(R, CARD, "mint", { fingerprint: C, owner: root.id }, { gas: 30 });
ok("minting works with 30 Tgas attached", getTransactionLastResult(m2)?.token_id === C, gasOf(m2));
const b = await call(R, CARD, "burn", { token_id: C }, { deposit: 1n });
ok("the holder can burn their own card", (await view(CARD, "nft_token", { token_id: C })) === null, gasOf(b));

console.log(failed ? `${failed} FAILED` : "all passed", "|", PROOF, CARD);
process.exit(failed ? 1 : 0);
