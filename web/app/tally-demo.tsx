"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { fingerprint, recordPath } from "@/lib/fingerprint";
import {
  VERDICTS,
  LookupError,
  explorerAccountUrl,
  explorerTxUrl,
  formatDay,
  formatMoment,
  lookup,
  verifiedCard,
  type ProofRecord,
  type Verdict,
} from "@/lib/near";
import { CardPanel } from "./card-panel";
import { ExternalIcon, SealIcon, UploadIcon } from "./icons";
import { Contracts, Fingerprint, SiteHeader, SwitchedOff, VerdictBar, send, type Card, type LookState } from "./parts";

const SAMPLES = [
  { file: "sample-card-a.png", label: "Sample A", hint: "Corrected once" },
  { file: "sample-card-b.png", label: "Sample B", hint: "Checked" },
  { file: "sample-card-c.png", label: "Sample C", hint: "Never checked" },
];
const MAX_BYTES = 20 * 1024 * 1024;

type Tab = "lookup" | "record" | "card";
type RecordState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "done"; record: ProofRecord; txHash: string }
  | { phase: "error"; message: string };

export default function TallyDemo({
  contractId,
  cardContractId,
  canRecord,
  canMint,
  initialFp,
}: {
  contractId: string;
  cardContractId: string;
  canRecord: boolean;
  canMint: boolean;
  initialFp: string | null;
}) {
  const [tab, setTab] = useState<Tab>("lookup");
  const [card, setCard] = useState<Card | null>(initialFp ? { name: "Opened from a link", fp: initialFp, preview: null, sample: false } : null);
  const [hashing, setHashing] = useState(false);
  const [pickError, setPickError] = useState("");
  const [look, setLook] = useState<LookState>(initialFp ? { phase: "checking" } : { phase: "idle" });
  const [txByCard, setTxByCard] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  /** Asks NEAR about a card: its record on the registry and, when it has one, its verified card. */
  const ask = useCallback(
    async (fp: string): Promise<LookState> => {
      try {
        const result = await lookup(fp, { contractId });
        const held = result.found ? await verifiedCard(fp, { contractId: cardContractId }).catch(() => "unknown" as const) : null;
        return { phase: "done", result, held };
      } catch (err) {
        return { phase: "error", message: err instanceof LookupError ? err.message : "Something went wrong. Try again." };
      }
    },
    [contractId, cardContractId],
  );

  // Opened from a link (a card's QR code): look the record up straight away.
  useEffect(() => {
    if (!initialFp) return;
    let live = true;
    void ask(initialFp).then((state) => live && setLook(state));
    return () => {
      live = false;
    };
  }, [initialFp, ask]);

  async function check(fp: string) {
    setLook({ phase: "checking" });
    setLook(await ask(fp));
  }

  async function load(name: string, bytes: ArrayBuffer, preview: string, sample: boolean) {
    setHashing(true);
    const fp = await fingerprint(bytes);
    setHashing(false);
    setCard({ name, fp, preview, sample });
    window.history.replaceState(null, "", recordPath(fp)); // the address bar now links to this card's record
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
      <SiteHeader current="demo" />
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="What to do">
          <button role="tab" id="tab-lookup" aria-selected={tab === "lookup"} aria-controls="panel" onClick={() => setTab("lookup")}>
            Look up a card
          </button>
          <button role="tab" id="tab-record" aria-selected={tab === "record"} aria-controls="panel" onClick={() => setTab("record")}>
            Record a check
          </button>
          <button role="tab" id="tab-card" aria-selected={tab === "card"} aria-controls="panel" onClick={() => setTab("card")}>
            Verified card
          </button>
        </div>
        <a className="network" href={explorerAccountUrl(contractId)} target="_blank" rel="noreferrer">
          <span className="dot" aria-hidden /> Live on NEAR testnet
        </a>
      </div>

      <main className="stage" data-linked={(card && !card.preview) || undefined}>
        <section className="cardside" aria-label="The card">
          <div>
            <label
              className="bay"
              data-dragging={dragging || undefined}
              data-scanning={hashing || look.phase === "checking" || undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
              {card?.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL or a sample, shown as it is
                <img src={card.preview} alt={`The card you picked: ${card.name}`} />
              ) : (
                <span className="bay-empty">
                  <UploadIcon />
                  <strong>{card ? "Opened from a link" : "Drop a PnL card here"}</strong>
                  <span>
                    {card
                      ? "There's no picture, only its fingerprint. Got the card? Drop it here to see if it's the same one."
                      : "or click to choose a picture. It never leaves your device."}
                  </span>
                </span>
              )}
            </label>
            {card?.preview && (
              <p className="bay-caption">
                <b>
                  {card.sample && <span className="sample-tag">SAMPLE</span>}
                  {card.sample ? SAMPLES.find((x) => x.file === card.name)?.label : card.name}
                </b>
                Drop or click the card to change it
              </p>
            )}
          </div>
          {pickError && (
            <p className="field-error" role="alert">
              {pickError}
            </p>
          )}

          <div className="samples">
            <p className="label">No card to hand? Try a made-up one</p>
            <ul>
              {SAMPLES.map((x) => (
                <li key={x.file}>
                  <button type="button" className="sample-btn" aria-pressed={card?.name === x.file} onClick={() => void pickSample(x.file)}>
                    <Image src={`/samples/${x.file}`} alt="" width={1600} height={900} sizes="(max-width: 940px) 30vw, 190px" />
                    <span>
                      {x.label}
                      <small>{x.hint}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="fingerprint" aria-live="polite">
            <p className="label">
              <span>Fingerprint</span>
              <span>SHA-256 of the picture, computed on your device</span>
            </p>
            {hashing ? (
              <p className="muted">Computing…</p>
            ) : card ? (
              <>
                <Fingerprint fp={card.fp} />
              </>
            ) : (
              <p className="muted">It appears here once you pick a card. Only this goes to NEAR.</p>
            )}
          </div>
        </section>

        <section className="panel" id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "lookup" ? (
            <LookupPanel
              look={look}
              txHash={card ? txByCard[card.fp] : undefined}
              contractId={contractId}
              onRetry={() => card && void check(card.fp)}
              onShowCard={() => setTab("card")}
            />
          ) : tab === "card" ? (
            <CardPanel
              key={card?.fp ?? "none"}
              card={card}
              look={look}
              canMint={canMint}
              cardContractId={cardContractId}
              onChanged={() => card && void ask(card.fp).then(setLook)}
              onRetry={() => card && void check(card.fp)}
            />
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

      <Contracts contractId={contractId} cardContractId={cardContractId} />
    </div>
  );
}

/** Copies the link that opens this card's record: what a Tally card's QR code would hold. */
function CopyLink({ fp }: { fp: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="links">
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          void navigator.clipboard.writeText(window.location.origin + recordPath(fp)).then(() => setCopied(true));
        }}
      >
        {copied ? "Link copied" : "Copy the link to this record"}
      </button>
      <span className="muted" aria-live="polite">
        {copied ? "Anyone who opens it sees this verdict, straight from NEAR." : "A Tally card's QR code can point here."}
      </span>
    </p>
  );
}

function LookupPanel({
  look,
  txHash,
  contractId,
  onRetry,
  onShowCard,
}: {
  look: LookState;
  txHash?: string;
  contractId: string;
  onRetry: () => void;
  onShowCard: () => void;
}) {
  return (
    <div aria-live="polite">
      <h1 className="panel-title">Did Tally check this card?</h1>
      {look.phase === "idle" && (
        <>
          <p className="lede">
            Drop a card, or try a made-up one. The answer comes straight from NEAR, with no Tally server in between.{" "}
            <Link href="/how-it-works">New here? See how it works.</Link>
          </p>
          <VerdictBar tone="none" keyText="RESULT" word="No card yet" />
        </>
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
          <VerdictBar tone="none" keyText="NOT CHECKED" word="No record" />
          <p className="verdict-line">Tally hasn&apos;t checked this card yet.</p>
          <p className="muted">There is no record for this fingerprint on {contractId}. A copy that differs by a single pixel has a different fingerprint.</p>
        </>
      )}
      {look.phase === "done" && look.result.found && (
        <>
          <VerdictBar tone={look.result.record.latest.verdict} keyText="CHECKED" word={look.result.record.latest.verdict} />
          <p className="verdict-line">
            Tally checked this card on {formatDay(look.result.record.latest.recorded_at_ms)} and found it {look.result.record.latest.verdict}.
          </p>
          <dl className="facts">
            <dt>Recorded</dt>
            <dd>
              <time dateTime={new Date(look.result.record.latest.recorded_at_ms).toISOString()}>
                {formatMoment(look.result.record.latest.recorded_at_ms)}
              </time>
              , by NEAR&apos;s clock
            </dd>
            <dt>Check id</dt>
            <dd className="id">{look.result.record.latest.check_id}</dd>
            <dt>On NEAR</dt>
            <dd>
              <a href={txHash ? explorerTxUrl(txHash) : explorerAccountUrl(contractId)} target="_blank" rel="noreferrer">
                {txHash ? "See this record on the explorer" : `See ${contractId} on the explorer`} <ExternalIcon />
              </a>
            </dd>
          </dl>
          {look.held && look.held !== "unknown" && (
            <p className="held">
              <SealIcon />
              <span>
                Has a verified card, held by <strong className="account">{look.held.holder}</strong>.
              </span>
              <button type="button" className="link-btn" onClick={onShowCard}>
                See it
              </button>
            </p>
          )}
          <CopyLink fp={look.result.record.fingerprint} />
          {look.result.history.length > 1 && (
            <div className="history">
              <p className="label">History: {look.result.history.length} entries, oldest first. Nothing is ever removed.</p>
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
        <SwitchedOff head="Recording is switched off on this copy of the page.">
          Lookups work for everyone. To try recording, run your own copy with your own testnet account and key: the README explains it step by step.
        </SwitchedOff>
      </div>
    );
  }

  async function submit() {
    if (!card) return;
    setState({ phase: "sending" });
    const res = await send<{ record: ProofRecord; txHash: string }>("/api/record", { fingerprint: card.fp, verdict, password });
    if (!res.ok) return setState({ phase: "error", message: res.message });
    setState({ phase: "done", ...res.body });
    setPassword("");
    onRecorded(card.fp, res.body.txHash);
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
          <VerdictBar tone={state.record.latest.verdict} keyText="RECORDED" word={state.record.latest.verdict} />
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
            <button type="button" className="btn-secondary" onClick={() => setState({ phase: "idle" })}>
              Record a correction
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
