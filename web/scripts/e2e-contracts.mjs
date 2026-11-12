// End-to-end test of the contracts on NEAR testnet: what unit tests can't cover, contracts calling each other.
// The card contract asks the proof registry before it mints, keeps or pays out a card; the paid check asks both,
// charges an agent's credit and pays the trader's verified card; the guard wallet asks both and pays a Real card's
// holder or refuses. It creates sub-accounts of the account you give it, deploys the contracts there and runs the
// whole flow for real, including an agent whose key can only pay for checks.
//
// Run: node scripts/e2e-contracts.mjs <account.json> <tally_proof.wasm> <tally_card.wasm> <tally_check.wasm> <tally_guard.wasm>
//   account.json: {"id":"<you>.testnet","pub":"ed25519:...","key":"ed25519:..."} for a THROWAWAY testnet account with
//   about 8 NEAR. Never a real key. Build the .wasm files with cargo-near (README, "Build and deploy").
//   TAG=x picks the sub-account names (proofx.<you>, cardx.<you>, checkx.<you>, guardx.<you>, agentx.<you>). MODE=redeploy puts new
//   code on accounts an earlier run made; MODE=skip only runs the checks.
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, getTransactionLastResult, teraToGas, nearToYocto } from "near-api-js";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const [, , acctFile, proofWasm, cardWasm, checkWasm, guardWasm] = process.argv;
if (!acctFile || !proofWasm || !cardWasm || !checkWasm || !guardWasm) {
  console.error("Run: node scripts/e2e-contracts.mjs <account.json> <tally_proof.wasm> <tally_card.wasm> <tally_check.wasm> <tally_guard.wasm>");
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
const PROOF = `proof${tag}.${root.id}`, CARD = `card${tag}.${root.id}`, CHECK = `check${tag}.${root.id}`, GUARD = `guard${tag}.${root.id}`, AGENT = `agent${tag}.${root.id}`;
const FEE = nearToYocto("0.01"), HALF = FEE / 2n; // one check, and the trader's 50% of it
const PICTURES = "https://tally-near.vercel.app"; // where a card's picture link starts
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
  catch (e) { const m = String(e?.message || e) + " " + (e?.constructor?.name ?? "") + " " + JSON.stringify(e?.context ?? e?.cause ?? "").slice(0, 600); const hit = want instanceof RegExp ? want.test(m) : m.includes(want); ok(what, hit, hit ? "" : m.slice(0, 400)); }
};
/** Waits for something a contract did after it answered (a payment or a burn it sent on) to show up. */
const until = async (read) => { for (let i = 0; i < 20; i++) { if (await read()) return true; await new Promise((r) => setTimeout(r, 700)); } return false; };
const call = (who, contractId, methodName, args, { gas = 100, deposit = 0n } = {}) =>
  who.callFunctionRaw({ contractId, methodName, args, gas: teraToGas(gas), deposit });

const mode = process.env.MODE || "create"; // create | redeploy (new code, same state) | skip
if (mode !== "skip") {
  for (const [id, wasm, near, init] of [
    [PROOF, proofWasm, "1.8", { attester: root.id }],
    [CARD, cardWasm, "2.7", { attester: root.id, registry: PROOF, pictures: PICTURES }],
    [CHECK, checkWasm, "2.1", { owner: root.id, registry: PROOF, cards: CARD, fee: FEE.toString(), trader_percent: 50 }],
    [GUARD, guardWasm, "1.9", { registry: PROOF, cards: CARD }],
  ]) {
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
ok("its metadata names the check and what it holds", token?.metadata?.extra === JSON.stringify({ check_id: "e2e-a", registry: PROOF, holds: "0" }), token?.metadata?.extra);
ok("its picture link carries only the fingerprint", token?.metadata?.media === `badge/${A}.png`, token?.metadata?.media);
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
const about = await view(CARD, "nft_metadata");
ok("nft_metadata follows the standard and says where pictures are", about.spec === "nft-1.0.0" && about.base_uri === PICTURES, about.base_uri);

const r1 = await call(acct(PROOF), CARD, "recheck", { fingerprint: A }); // anyone may ask
ok("a recheck keeps a card that is still Real", getTransactionLastResult(r1) === true, gasOf(r1));
await call(R, PROOF, "record", { fingerprint: A, verdict: "Fake", check_id: "e2e-a-corrected" });
const r2 = await call(acct(PROOF), CARD, "recheck", { fingerprint: A });
ok("a recheck burns a card whose verdict was corrected", getTransactionLastResult(r2) === false, gasOf(r2));
ok("the burn logged the standard event", JSON.stringify(r2.receipts_outcome.map((r) => r.outcome.logs)).includes("nft_burn"));
// (a read straight after a call can still show the block before it)
ok("the card is gone", await until(async () => (await view(CARD, "nft_token", { token_id: A })) === null && (await view(CARD, "nft_total_supply")) === "0"));

// with only the gas the demo page attaches
await call(R, PROOF, "record", { fingerprint: C, verdict: "Real", check_id: "e2e-c" });
const m2 = await call(R, CARD, "mint", { fingerprint: C, owner: root.id }, { gas: 30 });
ok("minting works with 30 Tgas attached", getTransactionLastResult(m2)?.token_id === C, gasOf(m2));
const b = await call(R, CARD, "burn", { token_id: C }, { deposit: 1n });
// a view straight after the call can reach a node that hasn't seen it yet, so it is read until it shows
ok("the holder can burn their own card", await until(async () => (await view(CARD, "nft_token", { token_id: C })) === null), gasOf(b));

// The paid check. D is Real and has a verified card, E is Fake, F was never checked.
const D = fp(), E = fp(), F = fp();
const holds = async (id) => JSON.parse((await view(CARD, "nft_token", { token_id: id }))?.metadata?.extra ?? "{}").holds;
const credit = () => view(CHECK, "credit_of", { account_id: AGENT });
await call(R, PROOF, "record", { fingerprint: D, verdict: "Real", check_id: "e2e-d" });
await call(R, PROOF, "record", { fingerprint: E, verdict: "Fake", check_id: "e2e-e" });
await call(R, CARD, "mint", { fingerprint: D, owner: root.id });

// the agent: its own account, and a key that can only call `check` on the paid check contract
const limited = KeyPair.fromRandom("ed25519");
if (mode === "create") await R.createSubAccount({ accountOrPrefix: AGENT, publicKey: root.pub, nearToTransfer: nearToYocto("0.5") });
await acct(AGENT).addFunctionCallAccessKey({ publicKey: limited.getPublicKey(), contractId: CHECK, methodNames: ["check"], allowance: nearToYocto("0.25") });
const agent = new Account(AGENT, provider, KeyPairSigner.fromSecretKey(limited.toString()));

const terms = await view(CHECK, "terms");
ok("the terms say what a check costs and who gets what", terms.fee === FEE.toString() && terms.trader_percent === 50 && terms.registry === PROOF && terms.cards === CARD);
await mustFail("an agent nobody loaded credit for gets no answer", "Not enough credit", () => call(agent, CHECK, "check", { fingerprint: D }));
await call(R, CHECK, "deposit", { account_id: AGENT }, { deposit: FEE * 3n });
ok("the owner loaded three checks of credit for the agent", (await credit()) === (FEE * 3n).toString());

const c1 = await call(agent, CHECK, "check", { fingerprint: D });
const a1 = getTransactionLastResult(c1);
ok("a paid check of a Real card answers Real and who holds its verified card", a1?.record?.latest?.verdict === "Real" && a1?.held_by === root.id, gasOf(c1));
ok("it cost one fee, half of it for the trader", a1?.charged === FEE.toString() && a1?.to_trader === HALF.toString() && (await credit()) === (FEE * 2n).toString());
ok("the trader's half is inside the verified card", await until(async () => (await holds(D)) === HALF.toString()), await holds(D));
ok("the other half is the contract's share", await until(async () => (await view(CHECK, "takings")) === HALF.toString()));
ok("the check logged its event", JSON.stringify(c1.receipts_outcome.map((r) => r.outcome.logs)).includes("tally_check"));

const c2 = await call(agent, CHECK, "check", { fingerprint: E });
const a2 = getTransactionLastResult(c2);
ok("a Fake card costs the same and pays no trader", a2?.record?.latest?.verdict === "Fake" && a2?.held_by === null && a2?.to_trader === "0" && (await credit()) === FEE.toString(), gasOf(c2));
const c3 = await call(agent, CHECK, "check", { fingerprint: F });
const a3 = getTransactionLastResult(c3);
ok("a card Tally never checked costs nothing", a3?.record === null && a3?.charged === "0" && (await credit()) === FEE.toString(), gasOf(c3));

await mustFail("the agent's key can't send NEAR anywhere", /access key|AccessKey|permission/i, () => agent.transfer({ receiverId: root.id, amount: 1n }));
await mustFail("the agent's key can't call anything but check", /access key|AccessKey|method/i, () => call(agent, CHECK, "refund", {}));
await mustFail("the agent's key can't call any other contract", /access key|AccessKey|receiver/i, () => call(agent, PROOF, "record", { fingerprint: F, verdict: "Real", check_id: "e2e-forged" }));

const w = await call(R, CARD, "withdraw", { token_id: D });
ok("the holder withdraws what the card holds, after the contract asked the registry", getTransactionLastResult(w) === HALF.toString() && (await holds(D)) === "0", gasOf(w));
await mustFail("nobody else can withdraw", "Only the holder", () => call(acct(PROOF), CARD, "earn", { fingerprint: D }, { deposit: 1n }).then(() => call(acct(PROOF), CARD, "withdraw", { token_id: D })));

// a correction, caught by the next paid check: the verified card is burned with what it held
await call(agent, CHECK, "check", { fingerprint: D });
ok("the card earned again", await until(async () => (await holds(D)) === (HALF + 1n).toString()), await holds(D));
await mustFail("a card that holds money can't be given up by accident", "Withdraw what this card holds", () => call(R, CARD, "burn", { token_id: D }, { deposit: 1n }));
await call(R, PROOF, "record", { fingerprint: D, verdict: "Fake", check_id: "e2e-d-corrected" });
await call(R, CHECK, "deposit", { account_id: AGENT }, { deposit: FEE * 2n });
const c5 = await call(agent, CHECK, "check", { fingerprint: D });
const a5 = getTransactionLastResult(c5);
ok("after the correction a paid check answers Fake and pays no trader", a5?.record?.latest?.verdict === "Fake" && a5?.held_by === null && a5?.to_trader === "0", gasOf(c5));
ok("and that check had the verified card burned", await until(async () => (await view(CARD, "nft_token", { token_id: D })) === null));
ok("what the card held is lost, locked in the card contract", (await view(CARD, "forfeited")) === (HALF + 1n).toString(), await view(CARD, "forfeited"));

const back = await call(acct(AGENT), CHECK, "refund", {}); // with the agent account's full key, which the agent itself never has
ok("the owner takes back the unspent credit", getTransactionLastResult(back) === FEE.toString() && (await credit()) === "0");
const mine = await view(CHECK, "takings");
const col = await call(R, CHECK, "collect", {});
ok("the contract's owner collects its share and nothing else", getTransactionLastResult(col) === mine && (await view(CHECK, "takings")) === "0", mine);
await mustFail("nobody else can collect", "Only the owner", () => call(acct(AGENT), CHECK, "collect", {}));

// The guard wallet: it asks the registry who is safe to pay. G is Real and the agent's account holds its verified
// card, E is Fake, F was never checked, H is Unclear, and C is Real with no verified card.
const G = fp(), H = fp();
await call(R, PROOF, "record", { fingerprint: G, verdict: "Real", check_id: "e2e-g" });
await call(R, PROOF, "record", { fingerprint: H, verdict: "Unclear", check_id: "e2e-h" });
await call(R, CARD, "mint", { fingerprint: G, owner: AGENT });
const wallet = () => view(GUARD, "wallet_of", { account_id: root.id });
const gt = await view(GUARD, "terms");
ok("the guard's terms say which registry and card contract it asks", gt.registry === PROOF && gt.cards === CARD && gt.paid === 0 && gt.refused === 0);
// the payer: a key of the owner's that can only call `pay` on the guard
const payKey = KeyPair.fromRandom("ed25519");
await R.addFunctionCallAccessKey({ publicKey: payKey.getPublicKey(), contractId: GUARD, methodNames: ["pay"], allowance: nearToYocto("0.25") });
const payer = new Account(root.id, provider, KeyPairSigner.fromSecretKey(payKey.toString()));
const pay = (fingerprint, amount) => call(payer, GUARD, "pay", { fingerprint, amount: amount.toString() }, { gas: 80 });
await mustFail("an account with no wallet can't pay", "has no wallet here", () => pay(G, HALF));
const opened = getTransactionLastResult(await call(R, GUARD, "deposit", { limit: FEE.toString() }, { deposit: FEE * 3n }));
ok("the owner loads the wallet and sets the most one payment may be", opened?.balance === (FEE * 3n).toString() && opened?.limit === FEE.toString());

const p1 = await pay(G, HALF);
const o1 = getTransactionLastResult(p1);
ok("a Real card's holder is paid after the wallet asked the registry", o1?.decision === "Allow" && o1?.paid === HALF.toString() && o1?.to === AGENT, gasOf(p1));
ok("the payment came out of the owner's wallet", (await wallet())?.balance === (FEE * 3n - HALF).toString());
ok("the payment logged its event", JSON.stringify(p1.receipts_outcome.map((r) => r.outcome.logs)).includes("tally_guard"));
const o2 = getTransactionLastResult(await pay(E, HALF));
ok("a Fake card is refused, with why", o2?.decision === "Block" && o2?.paid === "0" && o2?.to === null && /Fake/.test(o2?.why), o2?.why);
const o3 = getTransactionLastResult(await pay(F, HALF));
ok("a card Tally never checked is refused", o3?.decision === "Block" && o3?.paid === "0" && /No record/.test(o3?.why), o3?.why);
const o4 = getTransactionLastResult(await pay(H, HALF));
ok("an Unclear card is not paid: the owner is to be asked", o4?.decision === "Warn" && o4?.paid === "0" && /ask the owner/.test(o4?.why), o4?.why);
const o5 = getTransactionLastResult(await pay(C, HALF)); // (C is still Real; its holder burned its verified card above)
ok("a Real card nobody holds has nobody to pay", o5?.decision === "Allow" && o5?.paid === "0" && /nobody to pay/.test(o5?.why), o5?.why);
ok("the refusals left the money where it was", (await wallet())?.balance === (FEE * 3n - HALF).toString());
await mustFail("a payment over the limit is refused before anyone is asked", "more than the owner's limit", () => pay(G, FEE + 1n));
await mustFail("the payer's key can't send NEAR anywhere", /access key|AccessKey|permission/i, () => payer.transfer({ receiverId: AGENT, amount: 1n }));
await mustFail("the payer's key can't take the money back", /access key|AccessKey|method/i, () => call(payer, GUARD, "refund", {}));
const gb = await call(R, GUARD, "refund", {});
ok("the owner takes back what the wallet still holds, and it is closed", getTransactionLastResult(gb) === (FEE * 3n - HALF).toString() && (await wallet()) === null, gasOf(gb));
const gt2 = await view(GUARD, "terms");
ok("the guard counted one payment and four refusals", gt2.paid === 1 && gt2.refused === 4, `${gt2.paid} paid, ${gt2.refused} refused`);

console.log(failed ? `${failed} FAILED` : "all passed", "|", PROOF, CARD, CHECK, GUARD);
process.exit(failed ? 1 : 0);
