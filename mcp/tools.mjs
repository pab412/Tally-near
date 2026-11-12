// What Tally's MCP server can do (server.mjs): three tools, all free reads. It asks Tally's proof registry on NEAR
// whether a PnL card is real and answers allow, warn or block with the reasons. No account, no key, nothing is paid
// and nothing is written. The read and the rule are the site's own (../web/scripts), so an agent asking here gets the
// answer the site and the contracts give.

import { readFile, stat } from "node:fs/promises";
import { DOES, decide } from "../web/scripts/agent-rule.mjs";
import { RPC_URL, fingerprint as fingerprintOf, isFingerprint, view } from "../web/scripts/near-read.mjs";

/** Where it reads: Tally's contracts on NEAR testnet, unless the environment names others. */
export const WHERE = {
  network: "testnet",
  rpcUrl: process.env.NEAR_RPC_URL || RPC_URL,
  registry: process.env.TALLY_REGISTRY || "proof.notpab.testnet",
  cards: process.env.TALLY_CARDS || "card.notpab.testnet",
};

/** The biggest file `fingerprint_file` will read: a PnL card is a picture, not a film. */
export const MAX_FILE = 25 * 1024 * 1024;

const NOT_A_FINGERPRINT = "That isn't a card fingerprint. A fingerprint is the SHA-256 of the card's picture file: 64 lower-case hex characters. Use fingerprint_file to get one from a file.";
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Whether to trust a PnL card: allow, warn or block, with the reasons from its record on NEAR. A registry that can't
 * be reached is a block, never a yes.
 * @param {string} fingerprint
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function checkCard(fingerprint, deps = {}) {
  if (!isFingerprint(fingerprint)) throw new Error(NOT_A_FINGERPRINT);
  const opts = { rpcUrl: WHERE.rpcUrl, fetch: deps.fetch };
  const record = await view(WHERE.registry, "get", { fingerprint }, opts).then(
    (r) => ({ record: r }),
    () => null,
  );
  // who holds its verified card, and every verdict it has had, when there is a record to ask about
  const [held, history] = record?.record
    ? await Promise.all([
        view(WHERE.cards, "nft_token", { token_id: fingerprint }, opts).catch(() => null),
        record.record.entries > 1 ? view(WHERE.registry, "history", { fingerprint }, opts).catch(() => null) : null,
      ])
    : [null, null];
  const answer = record && { record: record.record, held_by: held?.owner_id ?? null };
  const { decision, reasons } = decide(answer);
  return {
    decision,
    does: DOES[decision],
    verdict: record?.record?.latest.verdict ?? null,
    reasons,
    entries: record?.record?.entries ?? 0,
    ...(Array.isArray(history) ? { history: history.map((h) => h.verdict) } : {}),
    held_by: answer?.held_by ?? null,
    fingerprint,
    registry: WHERE.registry,
    network: WHERE.network,
  };
}

/**
 * Every verdict a card has had, oldest first. The last one is the one that stands; a correction never removes what
 * came before it.
 * @param {string} fingerprint
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function cardHistory(fingerprint, deps = {}) {
  if (!isFingerprint(fingerprint)) throw new Error(NOT_A_FINGERPRINT);
  let entries;
  try {
    entries = await view(WHERE.registry, "history", { fingerprint }, { rpcUrl: WHERE.rpcUrl, fetch: deps.fetch });
  } catch {
    throw new Error("The registry on NEAR didn't answer, so the card's history isn't known. Treat that as a block, and try again.");
  }
  return {
    fingerprint,
    entries: entries.map((e) => ({ verdict: e.verdict, check_id: e.check_id, recorded: day(e.recorded_at_ms), recorded_at_ms: e.recorded_at_ms })),
    registry: WHERE.registry,
    network: WHERE.network,
  };
}

/**
 * The fingerprint of a picture file on this computer: the SHA-256 of its exact bytes. The file is read here and
 * never sent anywhere; only the fingerprint is ever looked up.
 * @param {string} path
 */
export async function fingerprintFile(path) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new Error("There is no file at that path.");
  if (info.size > MAX_FILE) throw new Error("That file is bigger than 25 MB, which is no PnL card picture.");
  return { fingerprint: await fingerprintOf(await readFile(path)), bytes: info.size };
}

/** The same answers in a sentence or two, for a reader who doesn't want JSON. */
export const inWords = {
  check_card: (a) =>
    `${a.does}. ${a.reasons.join("; ")}.${a.history ? ` Its verdicts, oldest first: ${a.history.join(", then ")}.` : ""} (Read from ${a.registry} on NEAR ${a.network}.)`,
  card_history: (a) =>
    a.entries.length
      ? `${a.entries.length === 1 ? "1 entry" : `${a.entries.length} entries`}, oldest first: ${a.entries.map((e) => `${e.verdict} (check ${e.check_id}, ${e.recorded})`).join(", then ")}. The last one stands.`
      : "No record: Tally has never checked this card.",
  fingerprint_file: (a) => `${a.fingerprint} (${a.bytes} bytes). A re-saved, resized or cropped copy of a card is another file with another fingerprint.`,
};
