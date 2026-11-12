// One free read of a contract on NEAR, and what a card's fingerprint is. No account, no key, no wallet. The one place
// the site (lib/near.ts, lib/fingerprint.ts), the scripts here and the MCP server (../mcp) all go through, so what one
// of them is shown is what the others see. Plain JavaScript with no dependencies, so each of them can import it.

/** A public NEAR testnet RPC node. */
export const RPC_URL = "https://rpc.testnet.fastnear.com";

/**
 * A card's fingerprint: 64 lower-case hex characters, and nothing else.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isFingerprint(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * The fingerprint of a picture: the SHA-256 hash of its exact bytes. One changed byte gives another fingerprint.
 * @param {BufferSource} bytes
 * @returns {Promise<string>}
 */
export async function fingerprint(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The JSON-RPC request that reads a contract. The site sends exactly this, and its For AI agents page prints it, so
 * what an agent is shown is what works.
 * @param {string} method
 * @param {object} args
 * @param {string} contractId
 * @param {"optimistic" | "final"} [finality] "optimistic" is the newest block, so a record shows the moment it is written
 */
export function viewRequest(method, args, contractId, finality = "optimistic") {
  return {
    jsonrpc: "2.0",
    id: "tally",
    method: "query",
    params: { request_type: "call_function", finality, account_id: contractId, method_name: method, args_base64: btoa(JSON.stringify(args)) },
  };
}

/** A read that didn't come back. `why` is "unreachable" (no connection), "refused" (NEAR's node said no) or "unreadable" (no such contract or method, or not JSON). */
export class NearReadError extends Error {
  /** @param {"unreachable" | "refused" | "unreadable"} why */
  constructor(why) {
    super(why);
    this.why = why;
  }
}

/**
 * Calls a read-only contract method and returns its JSON result.
 * @param {string} contractId
 * @param {string} method
 * @param {object} [args]
 * @param {{ rpcUrl?: string, fetch?: typeof fetch, finality?: "optimistic" | "final", timeoutMs?: number }} [opts]
 * @returns {Promise<any>}
 */
export async function view(contractId, method, args = {}, opts = {}) {
  let res;
  try {
    res = await (opts.fetch ?? fetch)(opts.rpcUrl ?? RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(viewRequest(method, args, contractId, opts.finality)),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch {
    throw new NearReadError("unreachable");
  }
  if (!res.ok) throw new NearReadError("refused");
  const json = await res.json().catch(() => null);
  const bytes = json?.result?.result;
  if (json?.error || json?.result?.error || !Array.isArray(bytes)) throw new NearReadError("unreadable");
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));
  } catch {
    throw new NearReadError("unreadable");
  }
}
