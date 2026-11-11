"use client";

// The site's two live readings from NEAR. Nothing here is written into the page ahead of time: each number and
// verdict is whatever the contracts answer when the page is open, and says so when they can't be reached.

import { useEffect, useState } from "react";
import { liveCounts, lookup, verdictSentence, viewCall, type Lookup, type ProofRecord } from "@/lib/near";
import { Busy, Finding, Note, RecordFacts } from "./parts";

/** A real record, read from the proof registry: the sections of a frame. */
export function LiveRecord({ fp, contractId }: { fp: string; contractId: string }) {
  const [state, setState] = useState<Lookup | "asking" | "unreachable">("asking");
  useEffect(() => {
    let live = true;
    lookup(fp, { contractId }).then(
      (result) => live && setState(result),
      () => live && setState("unreachable"),
    );
    return () => {
      live = false;
    };
  }, [fp, contractId]);

  if (state === "asking") return <Busy>Reading from NEAR…</Busy>;
  if (state === "unreachable")
    return (
      <Note role="status">
        <p>NEAR couldn&apos;t be reached just now. The demo page will try again.</p>
      </Note>
    );
  if (!state.found)
    return (
      <Finding tone="none" word="No record">
        Tally hasn&apos;t checked this card yet.
      </Finding>
    );
  const { latest } = state.record;
  return (
    <>
      <Finding tone={latest.verdict} word={latest.verdict}>
        {verdictSentence(latest)}
      </Finding>
      <RecordFacts record={state.record} contractId={contractId} />
    </>
  );
}

/** The contract's answer for a card exactly as an agent receives it, once decoded: plain JSON, read now. */
export function LiveAnswer({ fp, contractId }: { fp: string; contractId: string }) {
  const [answer, setAnswer] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    viewCall<ProofRecord | null>("get", { fingerprint: fp }, { contractId }).then(
      (record) => live && setAnswer(JSON.stringify(record, null, 2)),
      () => live && setAnswer("NEAR couldn't be reached just now."),
    );
    return () => {
      live = false;
    };
  }, [fp, contractId]);
  return (
    <pre className="code" aria-live="polite">
      <code>{answer ?? "Asking NEAR…"}</code>
    </pre>
  );
}

/** How many cards are on record and how many verified cards exist, right now. Shown once there are a few to count. */
export function LiveCounts({ contractId, cardContractId, min = 3 }: { contractId: string; cardContractId: string; min?: number }) {
  const [counts, setCounts] = useState<{ cards: number | null; verified: number | null } | null>(null);
  useEffect(() => {
    let live = true;
    void liveCounts({ contractId, cardContractId }).then((c) => live && setCounts(c));
    return () => {
      live = false;
    };
  }, [contractId, cardContractId]);

  // a count is shown only once its contract has answered; one that can't be read is left out, never guessed
  const shown = (["cards", "verified"] as const).filter((key) => counts?.[key] != null);
  if (!shown.length || (counts?.cards ?? 0) < min) return null;
  return (
    <dl className="counts" aria-label="On NEAR right now">
      {shown.map((key) => (
        <div key={key}>
          <dt>{key === "cards" ? "Cards on record" : "Verified cards"}</dt>
          <dd>{counts![key]!.toLocaleString("en-US")}</dd>
        </div>
      ))}
      <p className="muted">Read from NEAR testnet as this page opened.</p>
    </dl>
  );
}
