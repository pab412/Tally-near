"use client";

// The front page's two live readings from NEAR. Nothing here is written into the page ahead of time: each number and
// verdict is whatever the contracts answer when the page is open, and says so when they can't be reached.

import { useEffect, useState } from "react";
import { formatMoment, liveCounts, lookup, type Lookup } from "@/lib/near";
import { VerdictBar } from "./parts";

/** A real record's verdict, read from the proof registry. */
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

  if (state === "asking") return <div className="strip">Asking NEAR…</div>;
  if (state === "unreachable") return <div className="strip">NEAR couldn&apos;t be reached just now. The demo page will try again.</div>;
  if (!state.found) return <VerdictBar tone="none" keyText="NOT CHECKED" word="No record" />;
  const { latest } = state.record;
  return (
    <>
      <VerdictBar tone={latest.verdict} keyText="CHECKED" word={latest.verdict} />
      <dl className="facts">
        <dt>Recorded</dt>
        <dd>{formatMoment(latest.recorded_at_ms)}, by NEAR&apos;s clock</dd>
        <dt>Check id</dt>
        <dd className="id">{latest.check_id}</dd>
      </dl>
    </>
  );
}

/** How many cards are on record and how many verified cards exist, right now. */
export function LiveCounts({ contractId, cardContractId }: { contractId: string; cardContractId: string }) {
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
  if (!shown.length) return null;
  return (
    <dl className="counts">
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
