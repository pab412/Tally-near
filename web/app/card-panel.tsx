"use client";

import { useState } from "react";
import type { CardOutcome } from "@/lib/card";
import { badgePath } from "@/lib/fingerprint";
import { explorerAccountUrl, explorerTxUrl, formatDay, isTestnetAccount, shortFingerprint } from "@/lib/near";
import { inNear } from "@/scripts/agent-rule.mjs";
import { AlertIcon, ExternalIcon, SealIcon } from "./icons";
import { Tilt } from "./motion";
import { Busy, Fact, Finding, Frame, Note, SwitchedOff, send, type Card, type LookState } from "./parts";

type Act =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "minted"; holder: string; txHash: string }
  | { phase: "rechecked"; stands: boolean; txHash: string }
  | { phase: "refused"; message: string }
  | { phase: "error"; message: string };

/**
 * The verified card for the card on the left: whether it has one, and (with the demo password) minting it or asking
 * the contract to recheck it. The contract decides both; this panel only shows what it said.
 */
export function CardPanel({
  card,
  look,
  canMint,
  cardContractId,
  onChanged,
  onRetry,
}: {
  card: Card | null;
  look: LookState;
  canMint: boolean;
  cardContractId: string;
  onChanged: () => void;
  onRetry: () => void;
}) {
  const [holder, setHolder] = useState("");
  const [password, setPassword] = useState("");
  const [act, setAct] = useState<Act>({ phase: "idle" });

  const held = look.phase === "done" ? look.held : null;
  const has = held !== null && held !== "unknown";
  const verdict = look.phase === "done" && look.result.found ? look.result.record.latest.verdict : null;

  async function submit() {
    if (!card) return;
    setAct({ phase: "sending" });
    const request = has ? { action: "recheck" } : { action: "mint", holder };
    const res = await send<CardOutcome>("/api/card", {
      ...request,
      fingerprint: card.fp,
      password,
    });
    if (!res.ok)
      return setAct({
        phase: res.status === 409 ? "refused" : "error",
        message: res.message,
      });
    setAct(
      has
        ? {
            phase: "rechecked",
            stands: res.body.stands === true,
            txHash: res.body.txHash,
          }
        : { phase: "minted", holder, txHash: res.body.txHash },
    );
    onChanged();
  }

  return (
    <div aria-live="polite">
      <h1 className="panel-title">Verified card</h1>
      <p className="lede">
        An NFT only a card found Real can have. It can&apos;t be sold or moved, and the contract burns it if the verdict is ever corrected.
      </p>
      {!card && (
        <Note>
          <p>Pick a card on the left first.</p>
        </Note>
      )}
      {card && (
        <Frame title="Verified card" aside={<span className="id">{cardContractId}</span>}>
          {look.phase === "checking" && <Busy>Reading from NEAR…</Busy>}
          {(look.phase === "error" || held === "unknown") && (
            <Note role="alert">
              <p>{look.phase === "error" ? look.message : `Couldn't read the card contract, ${cardContractId}. Try again in a moment.`}</p>
              <button type="button" className="btn-secondary" onClick={onRetry}>
                Try again
              </button>
            </Note>
          )}
          {look.phase === "done" && held && held !== "unknown" && (
            <>
              <Finding tone="Real" word="Held" icon={<SealIcon />}>
                Held by <span className="account">{held.holder}</span> since {formatDay(held.mintedAtMs)}.
              </Finding>
              {verdict === "Real" && (
                <div className="badge-art">
                  <Tilt>
                    {/* eslint-disable-next-line @next/next/no-img-element -- drawn fresh by /badge each time, so it's never a stale copy */}
                    <img src={badgePath(held.fingerprint)} alt="The verified card's picture: this card with a Verified on NEAR stamp" width={1200} height={1200} />
                  </Tilt>
                  <p>The picture wallets and explorers show for this NFT.</p>
                </div>
              )}
              <dl className="facts">
                <Fact label="Holds">
                  {inNear(held.holdsYocto)} NEAR <span className="muted">from paid checks, the holder&apos;s to withdraw while the card is Real</span>
                </Fact>
                <Fact label="From check" mono>
                  {held.checkId}
                </Fact>
                <Fact label="Picture link">
                  <a href={badgePath(held.fingerprint)} target="_blank" rel="noreferrer">
                    /badge/{shortFingerprint(held.fingerprint)}.png <ExternalIcon />
                  </a>
                </Fact>
                <Fact label="Contract">
                  <a href={explorerAccountUrl(cardContractId)} target="_blank" rel="noreferrer">
                    {cardContractId} <ExternalIcon />
                  </a>
                </Fact>
              </dl>
              {verdict !== "Real" && (
                <Note tone="Unclear" icon={<AlertIcon />}>
                  <p>
                    The registry now says {verdict ?? "nothing"} for this card, so it shouldn&apos;t have a verified card any more. Ask for a recheck
                    and the contract burns it.
                  </p>
                </Note>
              )}
            </>
          )}
          {look.phase === "done" && held === null && (
            <Finding tone="none" word="None" icon={<SealIcon />}>
              {verdict === "Real"
                ? "The registry says this card is Real, so it can have one."
                : verdict
                  ? `The registry says ${verdict}. The contract will refuse to mint this one.`
                  : "Tally hasn't checked this card. The contract will refuse to mint this one."}
            </Finding>
          )}
          {act.phase === "minted" && <Outcome txHash={act.txHash}>Minted to {act.holder}. The contract asked the registry first.</Outcome>}
          {act.phase === "rechecked" && (
            <Outcome txHash={act.txHash} gone={!act.stands}>
              {act.stands
                ? "Still stands. The contract asked the registry, and it says Real."
                : "Burned. The registry no longer says Real, so the contract removed the card."}
            </Outcome>
          )}
          {act.phase === "refused" && (
            <Note tone="Fake" head="The contract refused" role="alert">
              <p>“{act.message}”</p>
            </Note>
          )}
        </Frame>
      )}
      {card && look.phase === "done" && held !== "unknown" && (
        <>
          <div className="card-act">
            {canMint ? (
              <form
                className="record-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {!held && (
                  <label className="field">
                    <span>NEAR testnet account that will hold it</span>
                    <input
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="name.testnet"
                      required
                      value={holder}
                      onChange={(e) => setHolder(e.target.value.trim().toLowerCase())}
                    />
                  </label>
                )}
                <label className="field">
                  <span>Demo password</span>
                  <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                {act.phase === "error" && (
                  <p className="field-error" role="alert">
                    {act.message}
                  </p>
                )}
                <button type="submit" className="btn-primary" disabled={act.phase === "sending" || !password || (!held && !isTestnetAccount(holder))}>
                  {act.phase === "sending" ? "Asking the contract…" : held ? "Recheck against the registry" : "Mint the verified card"}
                </button>
              </form>
            ) : (
              <SwitchedOff head="Minting is switched off on this copy of the page.">
                Anyone can see whether a card has a verified card. To mint or recheck one, run your own copy with your own testnet account and keys:
                the README explains it step by step.
              </SwitchedOff>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Outcome({ txHash, gone, children }: { txHash: string; gone?: boolean; children: React.ReactNode }) {
  return (
    <Note tone={gone ? "Fake" : "Real"} role="status">
      <p>{children}</p>
      <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
        View the transaction <ExternalIcon />
      </a>
    </Note>
  );
}
