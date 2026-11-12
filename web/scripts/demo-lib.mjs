// What the demo scripts share (demo-agent.mjs, demo-guard.mjs): NEAR testnet, a free read, the demo's cards, and the
// throwaway testnet account each run uses. Testnet only. Never a real key.
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { RPC_URL, view as read } from "./near-read.mjs";

export const provider = new JsonRpcProvider({ url: RPC_URL });
const KEPT = new URL("../.demo-agent.json", import.meta.url);

/** A card recorded Fake on proof.notpab.testnet. */
export const FAKE = "cab484af6173d22914dcb29a6b5911c0671c33fdd0ef84bfdac8fed23be332b8";
/** A sample card's fingerprint: the SHA-256 of its picture file in public/samples. */
export const sample = (letter) => createHash("sha256").update(readFileSync(new URL(`../public/samples/sample-card-${letter}.png`, import.meta.url))).digest("hex");

/** One free read of a contract. */
export const view = (contractId, method, args = {}) => read(contractId, method, args);
export const short = (fp) => `${fp.slice(0, 8)}…${fp.slice(-8)}`;
export const say = (line = "") => console.log(line);
export const stop = (line) => { console.error(line); process.exit(1); };
/** Where anyone can see a transaction: what was asked, of whom, and what came back, on NEAR for good. */
export const receipt = (tx) => `https://testnet.nearblocks.io/txns/${tx.transaction.hash}`;
// anything unexpected (NEAR unreachable, an account out of NEAR) ends with one plain line, not a stack trace
process.on("unhandledRejection", (err) => stop(`Stopped: ${err?.message ?? err}`));

/**
 * The owner gives its agent a key of its own that can only call the named methods on one contract: `agent` signs with
 * it, and `key` is its public half, for taking it away again. NEAR takes a moment to show a new key to every node, and
 * an agent that signs before then is told its key doesn't exist, so this waits until the key can be read.
 */
export async function agentWith(owner, contractId, methodNames) {
  const pair = KeyPair.fromRandom("ed25519");
  const key = pair.getPublicKey();
  // the allowance is the most gas this key can ever pay for: NEAR holds back about 0.1 NEAR per call and returns what's unused
  await owner.addFunctionCallAccessKey({ publicKey: key, contractId, methodNames, allowance: 250_000_000_000_000_000_000_000n });
  for (let tries = 0; tries < 30; tries++) {
    const there = await provider.viewAccessKey({ accountId: owner.accountId, publicKey: key, finalityQuery: { finality: "final" } }).then(() => true, () => false);
    if (there) return { agent: new Account(owner.accountId, provider, KeyPairSigner.fromSecretKey(pair.toString())), key };
    await new Promise((r) => setTimeout(r, 700));
  }
  return stop("NEAR hasn't shown the agent's new key yet. Run it again in a minute.");
}

/**
 * The owner's testnet account: yours (AGENT_ACCOUNT=<account.json>, {"id","pub","key"}), the one kept from an earlier
 * run (.demo-agent.json), or a new throwaway made with NEAR's testnet faucet.
 */
export async function ownerAccount() {
  const file = process.env.AGENT_ACCOUNT ? process.env.AGENT_ACCOUNT : existsSync(KEPT) ? KEPT : null;
  const me = file ? JSON.parse(readFileSync(file, "utf8")) : await fromFaucet();
  if (!me.id.endsWith(".testnet")) stop("This demo only runs on NEAR testnet.");
  return me;
}

async function fromFaucet() {
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
