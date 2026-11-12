"use client";

import { useState } from "react";
import type { Run } from "@/lib/break-it";
import { ATTACKS, ENDED, MAX_MESSAGE, lineOf } from "@/lib/break-it-words";
import { LockIcon } from "../icons";
import { Busy, Finding, Frame, MARK, Note, send } from "../parts";

type Shown = Run & { model: string };
type State = { phase: "idle" } | { phase: "sending" } | { phase: "done"; run: Shown } | { phase: "error"; message: string };

/** One attempt as the page shows it: how it ended, then each thing that happened, in order. */
export function Log({ run }: { run: Shown }) {
  const ended = ENDED[run.outcome];
  return (
    <>
      <Finding tone={ended.tone} word={ended.word}>
        {ended.means}
      </Finding>
      <ol className="log">
        {run.steps.map((step, i) => {
          const line = lineOf(step);
          const Mark = line.tone ? MARK[line.tone] : null;
          return (
            <li key={i} data-verdict={line.tone}>
              <p className="log-who">{line.who}</p>
              <p className="log-what">
                {Mark && <Mark />}
                {line.what}
              </p>
              {line.detail && <p className="log-detail">{line.detail}</p>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** The part of the page a visitor uses: a message to the model, three ready-made attacks, and what then happened. */
export default function Attempt({ on, model }: { on: boolean; model: string }) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const sending = state.phase === "sending";

  async function go(text: string) {
    setMessage(text);
    setState({ phase: "sending" });
    const res = await send<Shown>("/api/agent", { message: text });
    setState(res.ok ? { phase: "done", run: res.body } : { phase: "error", message: res.message });
  }

  return (
    <div className="attempt">
      <form
        className="attempt-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim()) void go(message);
        }}
      >
        <fieldset disabled={!on || sending}>
          <legend>Try an attack in one click</legend>
          <div className="attacks">
            {ATTACKS.map((a) => (
              <button key={a.label} type="button" className="btn-secondary" onClick={() => void go(a.text)}>
                {a.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Or write your own message to the agent</span>
          <textarea
            rows={5}
            maxLength={MAX_MESSAGE}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!on || sending}
            placeholder="Talk it into copying the trader"
          />
        </label>
        <p className="attempt-send">
          <button type="submit" className="btn-primary" disabled={!on || sending || !message.trim()}>
            {sending ? "Asking the model…" : "Send to the model"}
          </button>
          <span className="muted">
            {message.length} of {MAX_MESSAGE}. Nothing you type is saved.
          </span>
        </p>
      </form>

      <div aria-live="polite">
        <Frame title="What happened" aside={<span className="id">{model}</span>}>
          {!on ? (
            <Note icon={<LockIcon />} head="The live model isn't switched on on this copy of the site.">
              <p>It needs a key for the model, which only the server holds.</p>
            </Note>
          ) : state.phase === "sending" ? (
            <Busy>The model is deciding, and whatever it tries goes through the guard…</Busy>
          ) : state.phase === "done" ? (
            <Log run={state.run} />
          ) : state.phase === "error" ? (
            <Note role="alert" head="That didn't go through.">
              <p>{state.message}</p>
            </Note>
          ) : (
            <p>Pick an attack or write your own. You&apos;ll see what the model said, what it tried, what NEAR answered and what the guard decided.</p>
          )}
        </Frame>
      </div>
    </div>
  );
}
