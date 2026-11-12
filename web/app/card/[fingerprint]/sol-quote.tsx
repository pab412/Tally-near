"use client";

import { useEffect, useState } from "react";
import { GOOD_FOR_MS, isFresh, isSolanaAddress, type SolQuote } from "@/lib/intents";
import { Frame } from "../../parts";

type State = { phase: "idle" } | { phase: "asking" } | { phase: "quoted"; quote: SolQuote } | { phase: "error"; message: string };

/**
 * What the card holds, as SOL at a Solana address the holder types. A quote, never a payout: NEAR Intents works with
 * real NEAR on mainnet, and this badge is on testnet.
 */
export default function SolanaQuote({ fingerprint, holds }: { fingerprint: string; holds: string }) {
  const [to, setTo] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const [stale, setStale] = useState(false);
  const quote = state.phase === "quoted" ? state.quote : null;

  // a price moves: once a quote is a minute old it is no longer shown as the price
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setStale(true), Math.max(0, GOOD_FOR_MS - (Date.now() - quote.atMs)));
    return () => clearTimeout(timer);
  }, [quote]);

  async function ask() {
    if (!isSolanaAddress(to.trim())) return setState({ phase: "error", message: "That isn't a Solana address." });
    setState({ phase: "asking" });
    setStale(false);
    try {
      const res = await fetch(`/api/quote?fp=${fingerprint}&to=${encodeURIComponent(to.trim())}`);
      const body = await res.json().catch(() => ({}));
      // the minute a quote is good for is counted from when this browser got it: the visitor's clock and the
      // server's can disagree by seconds or minutes, so the server's own time is never compared with this one
      const quote = res.ok && typeof body.sol === "string" ? { ...body, atMs: Date.now() } : null;
      setState(quote && isFresh(quote) ? { phase: "quoted", quote } : { phase: "error", message: body.error ?? "That didn't work. Try again." });
    } catch {
      setState({ phase: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <Frame title="What it holds, as SOL on Solana" aside={<span className="tag">Quote, not a payout</span>}>
      <form
        className="quote-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label className="field">
          <span>A Solana address to quote for</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off" placeholder="A Solana address" />
        </label>
        <button type="submit" className="btn-secondary" disabled={state.phase === "asking" || !to.trim()}>
          {state.phase === "asking" ? "Asking…" : "See Solana payout"}
        </button>
      </form>
      <div aria-live="polite">
        {state.phase === "error" && (
          <p className="field-error" role="alert">
            {state.message}
          </p>
        )}
        {quote && !stale && (
          <p className="quote-said">
            <strong>About {quote.sol} SOL</strong>
            {quote.usd && ` (about $${quote.usd})`} for the {holds} this card holds{quote.seconds > 0 && `, in about ${quote.seconds} seconds`}.
          </p>
        )}
        {quote && stale && <p>That quote is over a minute old, and prices move. Ask again.</p>}
      </div>
      <p>
        A live quote from NEAR Intents. Nothing is sent: it works with real NEAR on mainnet, and this badge is on testnet. Nothing you type is saved.
      </p>
    </Frame>
  );
}
