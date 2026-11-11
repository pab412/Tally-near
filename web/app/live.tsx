"use client";

// The pages' small live readings from NEAR (the front page's ledger is in ledger.tsx). Nothing here is written into
// the page ahead of time: each number and verdict is whatever the contracts answer when the page is open, and says so
// when they can't be reached.

import { useEffect, useState, type ReactNode } from "react";
import { checkTerms, explorerAccountUrl, lookup, verdictSentence, viewCall, type CheckTerms, type Lookup } from "@/lib/near";
import { inNear } from "@/scripts/agent-rule.mjs";
import { ExternalIcon } from "./icons";
import { Busy, Fact, Finding, Note, RecordFacts } from "./parts";

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

/** A contract's answer to a free read exactly as an agent receives it, once decoded: plain JSON, read now. */
export function LiveAnswer({ method, args, contractId }: { method: string; args: object; contractId: string }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const sent = JSON.stringify(args);
  useEffect(() => {
    let live = true;
    viewCall<unknown>(method, JSON.parse(sent), { contractId }).then(
      (result) => live && setAnswer(JSON.stringify(result, null, 2)),
      () => live && setAnswer("NEAR couldn't be reached just now."),
    );
    return () => {
      live = false;
    };
  }, [method, sent, contractId]);
  return (
    <pre className="code" aria-live="polite">
      <code>{answer ?? "Asking NEAR…"}</code>
    </pre>
  );
}

/** What a paid check costs right now, read from the paid check contract: the sections of a frame. */
export function LiveTerms({ contractId }: { contractId: string }) {
  const [state, setState] = useState<CheckTerms | "asking" | "unreachable">("asking");
  useEffect(() => {
    let live = true;
    checkTerms({ contractId }).then(
      (terms) => live && setState(terms),
      () => live && setState("unreachable"),
    );
    return () => {
      live = false;
    };
  }, [contractId]);

  if (state === "asking") return <Busy>Reading from NEAR…</Busy>;
  if (state === "unreachable")
    return (
      <Note role="status">
        <p>NEAR couldn&apos;t be reached just now. The paid check is at {contractId}.</p>
      </Note>
    );
  return (
    <TermsFacts terms={state}>
      <Fact label="Contract">
        <a href={explorerAccountUrl(contractId)} target="_blank" rel="noreferrer">
          {contractId} <ExternalIcon />
        </a>
      </Fact>
    </TermsFacts>
  );
}

/** What a paid check costs and how many were answered, as a table. Rows passed in are added at the end. */
export function TermsFacts({ terms, children }: { terms: CheckTerms; children?: ReactNode }) {
  return (
    <dl className="facts">
      <Fact label="One check">{inNear(terms.fee)} NEAR</Fact>
      <Fact label="To the trader">{terms.trader_percent}% of it, into their verified card</Fact>
      <Fact label="Answered so far">{terms.checks.toLocaleString("en-US")}</Fact>
      {children}
    </dl>
  );
}
