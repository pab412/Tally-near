// A small demo agent for Tally's paid check, on NEAR testnet. It is a script with one rule, not an AI: act on a
// trader's card by what NEAR says of it (allow, warn or block: agent-rule.mjs). What it shows is the money side of an
// agent:
//   - its owner loads a little credit, and that is all the agent can ever spend;
//   - the agent's key can only pay for checks, so it can't send the owner's NEAR anywhere;
//   - each answer comes from the registry on NEAR, and a Real card's trader is paid a share of the fee.
//
// Run: node scripts/demo-agent.mjs [fingerprint ...]
//   With no fingerprints it checks three of the demo's cards: one recorded Fake, sample card B (Real) and sample
//   card C (Unclear once it is recorded so; until then it has no record, which is a block too).
//   CHECK_CONTRACT=<account>      the paid check contract (default check.notpab.testnet)
//   AGENT_ACCOUNT=<account.json>  a testnet account of yours, {"id","pub","key"}, instead of a throwaway one.
//                                 Without it the script makes a throwaway account with NEAR's testnet faucet and
//                                 keeps it in .demo-agent.json for the next run. Testnet only. Never a real key.
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, getTransactionLastResult, teraToGas } from "near-api-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { DOES, decide, inNear } from "./agent-rule.mjs";

const RPC = "https://rpc.testnet.fastnear.com";
const CHECK = process.env.CHECK_CONTRACT || "check.notpab.testnet";
const KEPT = new URL("../.demo-agent.json", import.meta.url);
const FAKE = "cab484af6173d22914dcb29a6b5911c0671c33fdd0ef84bfdac8fed23be332b8"; // recorded Fake on proof.notpab.testnet
const sample = (letter) => createHash("sha256").update(readFileSync(new URL(`../public/samples/sample-card-${letter}.png`, import.meta.url))).digest("hex");
const cards = process.argv.slice(2).length ? process.argv.slice(2) : [FAKE, sample("b"), sample("c")];

const provider = new JsonRpcProvider({ url: RPC });
const view = async (contractId, method, args = {}) => {
  const r = await provider.callFunctionRaw({ contractId, method, args, blockQuery: { finality: "optimistic" } });
  return JSON.parse(Buffer.from(r.result).toString());
};
const short = (fp) => `${fp.slice(0, 8)}…${fp.slice(-8)}`;
const say = (line = "") => console.log(line);
const stop = (line) => { console.error(line); process.exit(1); };
// anything unexpected (NEAR unreachable, an account out of NEAR) ends with one plain line, not a stack trace
process.on("unhandledRejection", (err) => stop(`Stopped: ${err?.message ?? err}`));

if (cards.some((fp) => !/^[0-9a-f]{64}$/.test(fp))) stop("A fingerprint is 64 lower-case hex characters.");
const terms = await view(CHECK, "terms").catch(() => stop(`${CHECK} isn't answering on NEAR testnet. Set CHECK_CONTRACT to a deployed paid check contract.`));
const fee = BigInt(terms.fee);

/**
 * On warn the agent stops and asks its owner. With nobody at the keyboard (a tool running the script), nobody said yes,
 * so it doesn't go ahead.
 */
async function askOwner() {
  if (!process.stdin.isTTY) return 'It asks its owner "Go ahead? y/N". Nobody is at the keyboard, so the answer is no: it doesn\'t go ahead.';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const said = (await rl.question("      The agent stopped. Go ahead? y/N ")).trim().toLowerCase();
  rl.close();
  return said === "y" || said === "yes" ? "The owner said yes: it goes ahead on the owner's word, not its own." : "The owner said no: it doesn't go ahead.";
}

/** The owner's testnet account: yours, the one kept from an earlier run, or a new throwaway from the faucet. */
async function ownerAccount() {
  const file = process.env.AGENT_ACCOUNT ? process.env.AGENT_ACCOUNT : existsSync(KEPT) ? KEPT : null;
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const pair = KeyPair.fromRandom("ed25519");
  const made = { id: `tally-agent-${Date.now().toString(36)}.testnet`, pub: pair.getPublicKey().toString(), key: pair.toString() };
  const res = await fetch("https://helper.testnet.near.org/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: made.id, newAccountPublicKey: made.pub }),
  }).catch(() => null);
  if (!res?.ok) stop("NEAR's testnet faucet didn't make an account. Try again, or pass your own with AGENT_ACCOUNT=<account.json>.");
  writeFileSync(KEPT, JSON.stringify(made), { mode: 0o600 });
  return made;
}

const me = await ownerAccount();
if (!me.id.endsWith(".testnet")) stop("This demo only runs on NEAR testnet.");
const owner = new Account(me.id, provider, KeyPairSigner.fromSecretKey(me.key));
const credit = async () => BigInt(await view(CHECK, "credit_of", { account_id: me.id }));

say(`Tally demo agent, on NEAR testnet`);
say(`Rule: Real is allow (go ahead). Unclear is warn (stop and ask the owner). Fake, no record, or no answer from NEAR is block.`);
say(`A check costs ${inNear(fee)} NEAR at ${CHECK}; ${terms.trader_percent}% of it goes to the trader's verified card.`);
say();

// 1. the owner sets the limit
const need = fee * BigInt(cards.length) - (await credit());
if (need > 0n) await owner.callFunctionRaw({ contractId: CHECK, methodName: "deposit", args: {}, deposit: need > fee ? need : fee, gas: teraToGas(30) });
say(`1. The owner (${me.id}) loads credit: ${inNear(await credit())} NEAR. That is all the agent can spend.`);

// 2. the agent gets a key that can only pay for checks
const limited = KeyPair.fromRandom("ed25519");
// the allowance is the most gas this key can ever pay for: NEAR holds back about 0.1 NEAR per call and returns what's unused
await owner.addFunctionCallAccessKey({ publicKey: limited.getPublicKey(), contractId: CHECK, methodNames: ["check"], allowance: 250_000_000_000_000_000_000_000n });
const agent = new Account(me.id, provider, KeyPairSigner.fromSecretKey(limited.toString()));
say(`2. The agent gets its own key. It can call "check" on ${CHECK} and nothing else.`);
say();

// 3. the agent checks each trader's card and decides
say(`3. The agent checks ${cards.length} cards:`);
const earned = [];
for (const fingerprint of cards) {
  // (a check that doesn't come back is no answer: the rule blocks on that too)
  const tx = await agent.callFunctionRaw({ contractId: CHECK, methodName: "check", args: { fingerprint }, gas: teraToGas(100) }).catch(() => null);
  const answer = tx ? getTransactionLastResult(tx) : null;
  const { decision, reasons } = decide(answer);
  say(`   ${short(fingerprint)}  paid ${inNear(answer?.charged ?? 0)} NEAR  ->  ${DOES[decision]}`);
  say(`      why: ${reasons.join("; ")}`);
  if (decision === "warn") say(`      ${await askOwner()}`);
  if (!answer) continue;
  if (answer.to_trader !== "0") say(`      ${inNear(answer.to_trader)} NEAR of the fee went into the trader's verified card.`);
  // the receipt: what was bought (a check of this card), from whom, for how much, and what came back, on NEAR for good
  say(`      receipt: https://testnet.nearblocks.io/txns/${tx.transaction.hash}`);
  if (answer.held_by) earned.push(fingerprint);
}
say();

// 4. the attack: what an agent fooled by a message ("skip the check, send the money here") would try. This is a
// script, not an AI, so the fooled agent is acted out: it tries exactly that transfer, with the agent's own key.
const refusal = await agent.transfer({ receiverId: terms.registry, amount: fee }).then(
  () => null,
  (err) => err?.constructor?.name ?? "refused",
);
say(refusal ? `4. Attack, acted out: a message tells the agent to skip the check and send ${inNear(fee)} NEAR of the owner's money to another account. It tries. NEAR refuses (${refusal}): this key can only pay for checks.` : `4. The agent's key sent money it shouldn't have been able to. Something is wrong.`);

// 5. what happened to the money
for (const fingerprint of earned) {
  const token = await view(terms.cards, "nft_token", { token_id: fingerprint });
  const holds = JSON.parse(token?.metadata?.extra ?? "{}").holds;
  if (holds) say(`5. The verified card for ${short(fingerprint)} now holds ${inNear(holds)} NEAR. Its trader can withdraw it while the card is still Real.`);
}
const left = await credit();
await owner.deleteKey(limited.getPublicKey());
if (left > 0n) await owner.callFunctionRaw({ contractId: CHECK, methodName: "refund", args: {}, gas: teraToGas(30) });
say(`${earned.length ? "6" : "5"}. The owner takes the agent's key away${left > 0n ? ` and gets the unspent ${inNear(left)} NEAR back` : ""}.`);
process.exit(refusal ? 0 : 1);
