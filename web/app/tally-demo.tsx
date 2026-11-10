"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { fingerprint } from "@/lib/fingerprint";
import {
  explorerAccountUrl,
  explorerTxUrl,
  formatDay,
  formatMoment,
  lookup,
  LookupError,
  VERDICTS,
  type Lookup,
  type ProofRecord,
  type Verdict,
} from "@/lib/near";
import { DownloadIcon, ExternalIcon, LockIcon, UploadIcon } from "./icons";

const SAMPLES = [
  { file: "sample-card-a.png", label: "Sample A", hint: "corrected" },
  { file: "sample-card-b.png", label: "Sample B", hint: "checked" },
  { file: "sample-card-c.png", label: "Sample C", hint: "never checked" },
];
const MAX_BYTES = 20 * 1024 * 1024;
const README = "https://github.com/pab412/Tally-near#try-recording-yourself";

type Card = { name: string; fp: string; preview: string; sample: boolean };
type LookState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; result: Lookup }
  | { phase: "error"; message: string };
type RecordState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "done"; record: ProofRecord; txHash: string }
  | { phase: "error"; message: string };

export default function TallyDemo({ contractId, canRecord }: { contractId: string; canRecord: boolean }) {
  const [tab, setTab] = useState<"lookup" | "record">("lookup");
  const [card, setCard] = useState<Card | null>(null);
  const [hashing, setHashing] = useState(false);
  const [pickError, setPickError] = useState("");
  const [look, setLook] = useState<LookState>({ phase: "idle" });
  const [txByCard, setTxByCard] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  async function check(fp: string) {
    setLook({ phase: "checking" });
    try {
      setLook({ phase: "done", result: await lookup(fp, { contractId }) });
    } catch (err) {
      setLook({ phase: "error", message: err instanceof LookupError ? err.message : "Something went wrong. Try again." });
    }
  }

  async function load(name: string, bytes: ArrayBuffer, preview: string, sample: boolean) {
    setHashing(true);
    const fp = await fingerprint(bytes);
    setHashing(false);
    setCard({ name, fp, preview, sample });
    await check(fp);
  }

  async function pickFile(file: File | undefined) {
    setPickError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) return setPickError("That isn't a picture. Choose a PNG, JPG or WebP card.");
    if (file.size > MAX_BYTES) return setPickError("That picture is over 20 MB. Choose a smaller one.");
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    await load(file.name, await file.arrayBuffer(), objectUrl.current, false);
  }

  async function pickSample(file: string) {
    setPickError("");
    try {
      const res = await fetch(`/samples/${file}`);
      if (!res.ok) throw new Error();
      await load(file, await res.arrayBuffer(), `/samples/${file}`, true);
    } catch {
      setPickError("Couldn't load that sample. Try again.");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void pickFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <p className="wordmark">
          {/* eslint-disable-next-line @next/next/no-img-element -- Tally's own logo, a small static file */}
          <img src="/tally-t.png" alt="" width={20} height={23} />
          Tally <span>on NEAR</span>
        </p>
        <div className="tabs" role="tablist" aria-label="What to do">
          <button role="tab" id="tab-lookup" aria-selected={tab === "lookup"} aria-controls="panel" onClick={() => setTab("lookup")}>
            Look up a card
          </button>
          <button role="tab" id="tab-record" aria-selected={tab === "record"} aria-controls="panel" onClick={() => setTab("record")}>
            Record a check
          </button>
        </div>
        <a className="network" href={explorerAccountUrl(contractId)} target="_blank" rel="noreferrer">
          <span className="dot" aria-hidden /> NEAR testnet · {contractId}
        </a>
      </header>

      <main className="stage">
        <section className="cardside" aria-label="The card">
          <label
            className="drop"
            data-dragging={dragging || undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
            {card ? (
              <span className="drop-loaded">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, never uploaded */}
                <img src={card.preview} alt={`The card you picked: ${card.name}`} />
                <span className="drop-name">
                  {card.sample && <span className="sample-tag">SAMPLE</span>}
                  {card.name}
                </span>
                <span className="drop-hint">Drop another picture, or click to choose one</span>
              </span>
            ) : (
              <span className="drop-empty">
                <UploadIcon />
                <strong>Drop a PnL card picture here</strong>
                <span className="drop-hint">or click to choose one. It stays on your device.</span>
              </span>
            )}
          </label>
          {pickError && (
            <p className="field-error" role="alert">
              {pickError}
            </p>
          )}

          <div className="samples">
            <p className="samples-title">No card to hand? Try a made-up one:</p>
            <ul>
              {SAMPLES.map((s) => (
                <li key={s.file}>
                  <button type="button" className="sample-btn" onClick={() => void pickSample(s.file)}>
                    <span className="sample-tag">SAMPLE</span> {s.label} <span className="muted">({s.hint})</span>
                  </button>
                  <a className="icon-link" href={`/samples/${s.file}`} download aria-label={`Download ${s.label}`}>
                    <DownloadIcon />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="fingerprint" aria-live="polite">
            <h2>Fingerprint</h2>
            {hashing ? (
              <p className="muted">Computing on your device…</p>
            ) : card ? (
              <>
                <p className="hash">{card.fp}</p>
                <Barcode fp={card.fp} />
              </>
            ) : (
              <p className="muted">The SHA-256 hash of the picture appears here. Only this goes to NEAR.</p>
            )}
          </div>
        </section>

        <section className="panel" id="panel" role="tabpanel" aria-labelledby={tab === "lookup" ? "tab-lookup" : "tab-record"}>
          {tab === "lookup" ? (
            <LookupPanel look={look} card={card} txHash={card ? txByCard[card.fp] : undefined} contractId={contractId} onRetry={() => card && void check(card.fp)} />
          ) : (
            <RecordPanel
              key={card?.fp ?? "none"}
              card={card}
              canRecord={canRecord}
              onRecorded={(fp, txHash) => {
                setTxByCard((m) => ({ ...m, [fp]: txHash }));
                void check(fp);
              }}
              onShowLookup={() => setTab("lookup")}
            />
          )}
        </section>
      </main>

      <footer className="how">
        <h2>How this works</h2>
        <ol>
          <li>Your picture stays on your device. This page computes its fingerprint, a SHA-256 hash, right here.</li>
          <li>The page asks NEAR for that fingerprint. No wallet, no Tally server in between.</li>
          <li>
            Tally writes every check to a NEAR contract. Nobody can change or delete it, Tally included; a correction is added on top and the
            earlier verdicts stay.
          </li>
        </ol>
        <p className="muted">
          Contract:{" "}
          <a href={explorerAccountUrl(contractId)} target="_blank" rel="noreferrer">
            {contractId} <ExternalIcon />
          </a>{" "}
          on NEAR testnet. Everything marked SAMPLE is made up.
        </p>
      </footer>
    </div>
  );
}

function Barcode({ fp }: { fp: string }) {
  return (
    <div className="barcode" aria-hidden>
      {fp.split("").map((c, i) => (
        <i key={i} style={{ height: `${((parseInt(c, 16) + 2) / 17) * 100}%` }} />
      ))}
    </div>
  );
}

function VerdictBar({ verdict, keyText }: { verdict: Verdict | null; keyText: string }) {
  return (
    <div className="verdict-bar" data-verdict={verdict ?? "none"}>
      <span className="verdict-key">{keyText}</span>
      <span className="verdict-word">{verdict ?? "No record"}</span>
    </div>
  );
}

function LookupPanel({
  look,
  card,
  txHash,
  contractId,
  onRetry,
}: {
  look: LookState;
  card: Card | null;
  txHash?: string;
  contractId: string;
  onRetry: () => void;
}) {
  return (
    <div aria-live="polite">
      <h1 className="panel-title">Did Tally check this card?</h1>
      {look.phase === "idle" && (
        <p className="lede">{card ? "Ready." : "Drop a card on the left, or try a SAMPLE. The answer comes straight from NEAR."}</p>
      )}
      {look.phase === "checking" && (
        <div className="strip" role="status">
          Checking NEAR…
        </div>
      )}
      {look.phase === "error" && (
        <div className="notice" role="alert">
          <p>{look.message}</p>
          <button type="button" className="btn-secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {look.phase === "done" && !look.result.found && (
        <>
          <VerdictBar verdict={null} keyText="NOT CHECKED" />
          <p className="verdict-line">Tally hasn&apos;t checked this card yet.</p>
          <p className="muted">There is no record for this fingerprint on {contractId}. A copy that differs by a single pixel has a different fingerprint.</p>
        </>
      )}
      {look.phase === "done" && look.result.found && (
        <>
          <VerdictBar verdict={look.result.record.latest.verdict} keyText="CHECKED" />
          <p className="verdict-line">
            Checked by Tally on {formatDay(look.result.record.latest.recorded_at_ms)}: {look.result.record.latest.verdict}
          </p>
          <p className="links">
            <a href={txHash ? explorerTxUrl(txHash) : explorerAccountUrl(contractId)} target="_blank" rel="noreferrer">
              {txHash ? "See this record on the NEAR explorer" : "See the records on the NEAR explorer"} <ExternalIcon />
            </a>
            <span className="muted">Check id {look.result.record.latest.check_id}</span>
          </p>
          {look.result.history.length > 1 && (
            <div className="history">
              <h2>History · {look.result.history.length} entries, oldest first</h2>
              <ol>
                {look.result.history.map((p, i, all) => (
                  <li key={i} data-latest={i === all.length - 1 || undefined}>
                    <span className="verdict-dot" data-verdict={p.verdict} aria-hidden />
                    <span className="history-verdict">{p.verdict}</span>
                    <span className="history-id">{p.check_id}</span>
                    <time dateTime={new Date(p.recorded_at_ms).toISOString()}>{formatMoment(p.recorded_at_ms)}</time>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RecordPanel({
  card,
  canRecord,
  onRecorded,
  onShowLookup,
}: {
  card: Card | null;
  canRecord: boolean;
  onRecorded: (fp: string, txHash: string) => void;
  onShowLookup: () => void;
}) {
  const [verdict, setVerdict] = useState<Verdict>("Fake");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<RecordState>({ phase: "idle" });

  if (!canRecord) {
    return (
      <div>
        <h1 className="panel-title">Record a check</h1>
        <div className="notice">
          <p className="notice-head">
            <LockIcon /> Recording is switched off on this copy of the page.
          </p>
          <p>
            Lookups work for everyone. To try recording, run your own copy with your own testnet account and key: the README explains it step by
            step.
          </p>
          <a href={README} target="_blank" rel="noreferrer">
            Try recording yourself <ExternalIcon />
          </a>
        </div>
      </div>
    );
  }

  async function submit() {
    if (!card) return;
    setState({ phase: "sending" });
    try {
      const res = await fetch("/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: card.fp, verdict, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ phase: "error", message: body.error ?? "That didn't work. Try again." });
      setState({ phase: "done", record: body.record, txHash: body.txHash });
      setPassword("");
      onRecorded(card.fp, body.txHash);
    } catch {
      setState({ phase: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <div>
      <h1 className="panel-title">Record a check</h1>
      <p className="lede">
        Demo only. This writes a <span className="sample-tag">SAMPLE</span> check for the card on the left to NEAR testnet, for good.
      </p>
      {!card ? (
        <p className="notice">Pick a card on the left first.</p>
      ) : state.phase === "done" ? (
        <div aria-live="polite">
          <VerdictBar verdict={state.record.latest.verdict} keyText="RECORDED" />
          <p className="verdict-line">
            Recorded on NEAR as entry {state.record.entries} for this card, check id {state.record.latest.check_id}.
          </p>
          <p className="links">
            <a href={explorerTxUrl(state.txHash)} target="_blank" rel="noreferrer">
              See the transaction on the NEAR explorer <ExternalIcon />
            </a>
            <button type="button" className="btn-secondary" onClick={onShowLookup}>
              Look it up
            </button>
          </p>
        </div>
      ) : (
        <form
          className="record-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset>
            <legend>Verdict</legend>
            <div className="segmented">
              {VERDICTS.map((v) => (
                <label key={v} data-verdict={v}>
                  <input type="radio" name="verdict" value={v} checked={verdict === v} onChange={() => setVerdict(v)} />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>Demo password</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {state.phase === "error" && (
            <p className="field-error" role="alert">
              {state.message}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={state.phase === "sending" || !password}>
            {state.phase === "sending" ? "Recording on NEAR…" : `Record as ${verdict}`}
          </button>
        </form>
      )}
    </div>
  );
}
