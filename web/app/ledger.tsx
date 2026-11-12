"use client";

// The front page's ledger: what the three contracts hold right now, in one frame with a tab for each. Nothing in it is
// written into the page ahead of time: every row and number is what NEAR answered when the page opened, and a part
// whose contract can't be read says so. What is read, and what can't be, is in lib/ledger.ts.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { badgePath, DEMO_PATH, isFingerprint, recordPath } from "@/lib/fingerprint";
import {
  entriesOf,
  findCard,
  latestOf,
  loadLedger,
  searchRows,
  searchText,
  tally,
  tallyChecks,
  type EntryPlace,
  type Ledger as LedgerData,
  type LedgerRow,
  type TallyChecks,
} from "@/lib/ledger";
import { explorerAccountUrl, formatDay, formatMoment, shortFingerprint, type CheckTerms, type Verdict, type VerifiedCard } from "@/lib/near";
import { inNear } from "@/scripts/agent-rule.mjs";
import { useRecordLink } from "./copy-link";
import { AlertIcon, ExternalIcon, SearchIcon } from "./icons";
import { TermsFacts } from "./live";
import { Bars, Busy, Fact, Fingerprint, History, MARK, Note } from "./parts";

/** A card the site can name: one of its own samples, or the README's example record. */
export interface KnownCard {
  fingerprint: string;
  label: string;
  /** Its picture, when the site has one. */
  image?: string;
}

// `short` is the name on a phone, where the three have to fit one row
const TABS = [
  { id: "proof", label: "Cards on record", short: "Records" },
  { id: "card", label: "Verified cards", short: "Verified" },
  { id: "check", label: "Paid checks", short: "Checks" },
] as const;
type TabId = (typeof TABS)[number]["id"];
type Opened = Record<string, boolean>;

/** What a row calls a real card from Tally's own list. A sample keeps its own name. */
const REAL_LABEL = { card: "Tally card", fake: "Confirmed fake", cleared: "Cleared" } as const;
const NOTE: Record<EntryPlace, string> = { only: "", corrected: "Corrected later, still on record", correction: "Correction, added on top" };
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const iso = (ms: number) => new Date(ms).toISOString();

export function Ledger({
  contractId,
  cardContractId,
  checkContractId,
  known,
  tallyUrl,
}: {
  contractId: string;
  cardContractId: string;
  checkContractId: string;
  known: readonly KnownCard[];
  /** Where Tally lists its own real checks (fingerprints only). The ledger asks NEAR about each of them too. */
  tallyUrl: string;
}) {
  const [tab, setTab] = useState<TabId>("proof");
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{ attempt: number; ledger: LedgerData; real: TallyChecks | null } | null>(null);
  const [openBadges, setOpenBadges] = useState<Opened>({});

  useEffect(() => {
    let live = true;
    // Tally's list says which real cards to ask about; without it the ledger still shows what the site can name itself
    void tallyChecks(tallyUrl).then(async (real) => {
      const names = [...known, ...(real?.records ?? [])].map((card) => card.fingerprint);
      const ledger = await loadLedger(names, { contractId, cardContractId, checkContractId });
      if (live) setRead({ attempt, ledger, real });
    });
    return () => {
      live = false;
    };
  }, [attempt, known, tallyUrl, contractId, cardContractId, checkContractId]);

  // what an earlier attempt read is not shown while a new one is asked
  const ledger = read?.attempt === attempt ? read.ledger : null;
  const nothingRead = ledger !== null && ledger.cards === null && ledger.verified === null && ledger.terms === null && !ledger.rows.length;
  const counts: Record<TabId, number | null | undefined> = { proof: ledger?.cards, card: ledger?.verifiedTotal, check: ledger?.terms?.checks };
  const contract = { proof: contractId, card: cardContractId, check: checkContractId }[tab];
  const real = read?.attempt === attempt ? read.real : null;
  const cardOf = (fp: string): KnownCard | undefined => {
    const mine = known.find((card) => card.fingerprint === fp);
    if (mine) return mine;
    const theirs = real?.records.find((r) => r.fingerprint === fp);
    return theirs && { fingerprint: fp, label: REAL_LABEL[theirs.kind] };
  };

  function seeBadge(fp: string) {
    setOpenBadges((was) => ({ ...was, [fp]: true }));
    setTab("card");
    document.getElementById("ledger-tab-card")?.focus(); // the button that was pressed is about to be hidden
  }

  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <h2 id="ledger-title" className="visually-hidden">
        On NEAR right now
      </h2>
      <div className="frame">
        <div className="ledger-head">
          <div className="tabs" role="tablist" aria-label="Which contract's records">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`ledger-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`ledger-panel-${t.id}`} onClick={() => setTab(t.id)}>
                <span className="tab-long">{t.label}</span>
                <span className="tab-short">{t.short}</span>
                {counts[t.id] != null && <b>{counts[t.id]!.toLocaleString("en-US")}</b>}
              </button>
            ))}
          </div>
          <a className="id" href={explorerAccountUrl(contract)} target="_blank" rel="noreferrer">
            {contract} <ExternalIcon />
          </a>
        </div>

        {TABS.map((t) => (
          <div key={t.id} className="ledger-panel" role="tabpanel" id={`ledger-panel-${t.id}`} aria-labelledby={`ledger-tab-${t.id}`} hidden={tab !== t.id}>
            {ledger === null ? (
              <Busy>Reading from NEAR…</Busy>
            ) : nothingRead ? (
              <Note role="status" head="NEAR couldn't be reached just now.">
                <button type="button" className="link-btn" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              </Note>
            ) : t.id === "proof" ? (
              <Records ledger={ledger} cardOf={cardOf} contractId={contractId} cardContractId={cardContractId} onSeeBadge={seeBadge} />
            ) : t.id === "card" ? (
              <Badges ledger={ledger} cardOf={cardOf} opened={openBadges} onToggle={(fp, open) => setOpenBadges((was) => ({ ...was, [fp]: open }))} />
            ) : (
              <Checks terms={ledger.terms} />
            )}
          </div>
        ))}
      </div>
      <p className="ledger-note muted">
        {ledger && !nothingRead && "Read from NEAR testnet as this page opened."}
        {ledger && !nothingRead && real && real.tally.counted > 0 && (
          <>
            {" "}
            Off the chain, Tally itself has counted {real.tally.counted.toLocaleString("en-US")} cards and caught {real.tally.caught.toLocaleString("en-US")} as
            fake (<a href="https://tallypnl.com">tallypnl.com</a>).
          </>
        )}
      </p>
    </section>
  );
}

/** The proof registry's tab: the cards it has a record for, by card or entry by entry, and a search by fingerprint. */
function Records({
  ledger,
  cardOf,
  contractId,
  cardContractId,
  onSeeBadge,
}: {
  ledger: LedgerData;
  cardOf: (fp: string) => KnownCard | undefined;
  contractId: string;
  cardContractId: string;
  onSeeBadge: (fp: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [view, setView] = useState<"cards" | "entries">("cards");
  const [opened, setOpened] = useState<Opened>({});
  const [asked, setAsked] = useState<{ fp: string; row: LedgerRow | null | "unreachable" } | null>(null);

  const text = searchText(typed);
  const matches = searchRows(ledger.rows, typed, (fp) => cardOf(fp)?.label ?? "");
  // a whole fingerprint that isn't in the table: the registry can be asked for exactly that
  const wanted = !matches.length && isFingerprint(text) ? text : null;

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    findCard(wanted, { contractId, cardContractId }).then(
      (row) => live && setAsked({ fp: wanted, row }),
      () => live && setAsked({ fp: wanted, row: "unreachable" }),
    );
    return () => {
      live = false;
    };
  }, [wanted, contractId, cardContractId]);

  const answer = wanted !== null && asked?.fp === wanted ? asked.row : undefined; // undefined while NEAR is asked
  const found = answer && answer !== "unreachable" ? answer : null;
  const rows = found ? [found] : matches;
  // rows start closed (the owner, 2026-11-11: "way too much readable information"); a card found by its fingerprint opens
  const isOpen = (fp: string) => opened[fp] ?? found !== null;
  const { entries, corrections } = tally(ledger.rows);
  const unnamed = ledger.cards !== null && ledger.cards > ledger.rows.length && !ledger.unread.length;

  return (
    <>
      <div className="ledger-tools">
        <div className="ledger-find">
          <label htmlFor="ledger-find" className="visually-hidden">
            Find a fingerprint
          </label>
          <div>
            <SearchIcon />
            <input
              id="ledger-find"
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Find a fingerprint"
              maxLength={100}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="ledger-view" role="group" aria-label="Show">
          <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>
            By card
          </button>
          <button type="button" aria-pressed={view === "entries"} onClick={() => setView("entries")}>
            Every entry
          </button>
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {text && !(wanted !== null && answer === undefined) ? `${rows.length} of ${ledger.rows.length + (found ? 1 : 0)} cards shown` : ""}
      </p>

      {rows.length > 0 && view === "cards" && (
        <>
          <div className="ledger-cols cols-cards" aria-hidden>
            <span />
            <span>Card</span>
            <span>Verdict</span>
            <span>Recorded</span>
            <span>Verified card</span>
            <span />
          </div>
          <ul className="ledger-rows">
            {rows.map((row) => (
              <RecordRow
                key={row.fingerprint}
                row={row}
                card={cardOf(row.fingerprint)}
                open={isOpen(row.fingerprint)}
                onToggle={() => setOpened((was) => ({ ...was, [row.fingerprint]: !isOpen(row.fingerprint) }))}
                onSeeBadge={onSeeBadge}
              />
            ))}
          </ul>
        </>
      )}
      {rows.length > 0 && view === "entries" && (
        <>
          <div className="ledger-cols cols-entries" aria-hidden>
            <span>Recorded</span>
            <span />
            <span>Card</span>
            <span>Verdict</span>
            <span>Check ID</span>
            <span>Note</span>
          </div>
          <ul className="ledger-rows">
            {entriesOf(rows).map(({ fingerprint, proof, place }) => (
              <li key={`${fingerprint} ${proof.check_id} ${proof.recorded_at_ms}`}>
                <div className="ledger-row cols-entries">
                  <time className="muted" dateTime={iso(proof.recorded_at_ms)}>
                    {formatMoment(proof.recorded_at_ms)}
                  </time>
                  <Thumb fp={fingerprint} image={cardOf(fingerprint)?.image} />
                  <CardCell fp={fingerprint} label={cardOf(fingerprint)?.label} />
                  <VerdictCell verdict={proof.verdict} />
                  <span className="id">{proof.check_id}</span>
                  <span className="muted">{NOTE[place]}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {!rows.length &&
        (wanted !== null ? (
          answer === undefined ? (
            <Busy>Asking NEAR…</Busy>
          ) : answer === "unreachable" ? (
            <Note role="status" head="NEAR couldn't be reached just now.">
              <Link href={recordPath(wanted)}>Look this card up in the demo</Link>
            </Note>
          ) : (
            <div className="ledger-empty">
              <b>No record for this fingerprint.</b>
              Tally hasn&apos;t checked that card. <Link href={recordPath(wanted)}>Open it in the demo</Link>
            </div>
          )
        ) : text ? (
          <div className="ledger-empty">
            <b>No card in this table matches “{typed.trim().slice(0, 64)}”.</b>Paste a whole fingerprint (64 characters) to ask NEAR for it.{" "}
            <Link href={DEMO_PATH}>Open the demo</Link>
          </div>
        ) : ledger.cards === null ? (
          <Note role="status" head="The registry couldn't be read just now.">
            <Link href={DEMO_PATH}>Look a card up in the demo</Link>
          </Note>
        ) : (
          <div className="ledger-empty">
            <b>No records to show yet.</b>A card gets its first one when Tally checks it. <Link href={DEMO_PATH}>Open the demo</Link>
          </div>
        ))}

      <p className="ledger-foot">
        <span>
          <Count n={ledger.rows.length} one="card" many="cards" />, <Count n={entries} one="entry" many="entries" />,{" "}
          <Count n={corrections} one="correction" many="corrections" />. Nothing is ever removed.
        </span>
        {unnamed && (
          <span>
            The registry holds {ledger.cards!.toLocaleString("en-US")} cards and keeps no list, so this table shows the ones this site can name. Paste a
            whole fingerprint to find any other.
          </span>
        )}
        {ledger.unread.length > 0 && (
          <span>
            {ledger.unread.length} more couldn&apos;t be read just now.
          </span>
        )}
      </p>
    </>
  );
}

/** One card on record. The row says where it stands; opened, it shows every verdict the card has had. */
function RecordRow({
  row,
  card,
  open,
  onToggle,
  onSeeBadge,
}: {
  row: LedgerRow;
  card: KnownCard | undefined;
  open: boolean;
  onToggle: () => void;
  onSeeBadge: (fp: string) => void;
}) {
  const { fingerprint: fp, history, held } = row;
  const latest = latestOf(row);
  const detail = `ledger-record-${fp}`;
  return (
    <li>
      <button type="button" className="ledger-row cols-cards" aria-expanded={open} aria-controls={detail} onClick={onToggle}>
        <Thumb fp={fp} image={card?.image} />
        <CardCell fp={fp} label={card?.label} />
        <VerdictCell verdict={latest.verdict}>{history.length > 1 && <small>corrected {times(history.length - 1)}</small>}</VerdictCell>
        <time className="muted wide" dateTime={iso(latest.recorded_at_ms)}>
          {formatDay(latest.recorded_at_ms)}
        </time>
        <span className="wide">
          {held && held !== "unknown" ? (
            <>
              Held by <span className="account">{held.holder}</span>
            </>
          ) : (
            <span className="muted">
              <span className="visually-hidden">Verified card: </span>
              {held ? "Couldn't be read" : "None"}
            </span>
          )}
        </span>
        <span className="ledger-chev" aria-hidden />
      </button>
      <div className="ledger-detail" id={detail} hidden={!open}>
        <div>
          <p className="label">{history.length === 1 ? "History" : "History, oldest first"}</p>
          <History entries={history} />
          {held === "unknown" ? (
            <p className="ledger-held">Whether it has a verified card couldn&apos;t be read just now.</p>
          ) : (
            held && (
              <p className="ledger-held">
                Its verified card is held by <span className="account">{held.holder}</span>.{" "}
                <button type="button" className="link-btn" onClick={() => onSeeBadge(fp)}>
                  See it
                </button>
              </p>
            )
          )}
        </div>
        <div>
          <p className="label">Fingerprint</p>
          <Fingerprint fp={fp} />
          <p className="ledger-act">
            <Link className="btn-secondary" href={recordPath(fp)}>
              Open this record in the demo
            </Link>
            <CopyLink fp={fp} />
          </p>
        </div>
      </div>
    </li>
  );
}

/** The card contract's tab: every verified card, who holds it and what it holds. */
function Badges({
  ledger,
  cardOf,
  opened,
  onToggle,
}: {
  ledger: LedgerData;
  cardOf: (fp: string) => KnownCard | undefined;
  opened: Opened;
  onToggle: (fp: string, open: boolean) => void;
}) {
  const { verified, verifiedTotal } = ledger;
  if (verified === null) return <Note role="status" head="The verified card contract couldn't be read just now." />;
  if (!verified.length)
    return (
      <div className="ledger-empty">
        <b>No verified cards yet.</b>A card found Real can have one. <Link href="/verified-cards">How a card gets one</Link>
      </div>
    );
  // what the registry says for a verified card's own card now, or null when that couldn't be read
  const verdictOf = (fp: string) => {
    const row = ledger.rows.find((r) => r.fingerprint === fp);
    return row ? latestOf(row).verdict : null;
  };
  return (
    <>
      <div className="ledger-cols cols-badges" aria-hidden>
        <span />
        <span>Card</span>
        <span>Holder</span>
        <span>Since</span>
        <span>Holds</span>
        <span />
      </div>
      <ul className="ledger-rows">
        {verified.map((held, i) => {
          const open = opened[held.fingerprint] ?? i === 0;
          return (
            <BadgeRow
              key={held.fingerprint}
              held={held}
              card={cardOf(held.fingerprint)}
              verdict={verdictOf(held.fingerprint)}
              open={open}
              onToggle={() => onToggle(held.fingerprint, !open)}
            />
          );
        })}
      </ul>
      <p className="ledger-foot">
        <span>Can&apos;t be sold or moved. Burns if the verdict is corrected.</span>
        {verifiedTotal !== null && verifiedTotal > verified.length && (
          <span>
            Showing the first {verified.length} of {verifiedTotal.toLocaleString("en-US")}.
          </span>
        )}
        <Link href="/verified-cards">Verified cards</Link>
      </p>
    </>
  );
}

function BadgeRow({
  held,
  card,
  verdict,
  open,
  onToggle,
}: {
  held: VerifiedCard;
  card: KnownCard | undefined;
  verdict: Verdict | null;
  open: boolean;
  onToggle: () => void;
}) {
  const fp = held.fingerprint;
  const detail = `ledger-badge-${fp}`;
  const holds = `${inNear(held.holdsYocto)} NEAR`;
  return (
    <li>
      <button type="button" className="ledger-row cols-badges" aria-expanded={open} aria-controls={detail} onClick={onToggle}>
        <Thumb fp={fp} image={card?.image} />
        <CardCell fp={fp} label={card?.label} />
        <span className="wide">
          <span className="account">{held.holder}</span>
        </span>
        <time className="muted wide" dateTime={iso(held.mintedAtMs)}>
          {formatDay(held.mintedAtMs)}
        </time>
        <span className="wide">{holds}</span>
        <span className="ledger-chev" aria-hidden />
      </button>
      <div className="ledger-detail" id={detail} hidden={!open}>
        {verdict === "Real" ? (
          <div className="badge-art">
            {/* the picture is asked for only once its row is open */}
            {open && (
              // eslint-disable-next-line @next/next/no-img-element -- drawn fresh by /badge each time, so it's never a stale copy
              <img src={badgePath(fp)} alt={`${card?.label ?? "This card"}'s verified card: the card with a Verified on NEAR stamp`} width={1200} height={1200} />
            )}
            <p>The picture wallets and explorers show for this NFT.</p>
          </div>
        ) : verdict === null ? (
          <Note role="status" head="This card's record couldn't be read just now." />
        ) : (
          <Note tone="Unclear" icon={<AlertIcon />}>
            <p>The registry now says {verdict} for this card, so it shouldn&apos;t have a verified card any more. Ask for a recheck and the contract burns it.</p>
          </Note>
        )}
        <div>
          <dl className="facts">
            <Fact label="Holder">
              <span className="account">{held.holder}</span>
            </Fact>
            <Fact label="Since">
              <time dateTime={iso(held.mintedAtMs)}>{formatDay(held.mintedAtMs)}</time>
            </Fact>
            <Fact label="Holds">
              {holds} <span className="muted">from paid checks</span>
            </Fact>
            <Fact label="From check" mono>
              {held.checkId}
            </Fact>
          </dl>
          <p className="ledger-act">
            <Link className="btn-secondary" href={recordPath(fp)}>
              Open this record in the demo
            </Link>
          </p>
        </div>
      </div>
    </li>
  );
}

/** The paid check contract's tab: who pays (agents, never a visitor), what a check costs and how many were answered. */
function Checks({ terms }: { terms: CheckTerms | null }) {
  if (!terms) return <Note role="status" head="The paid check contract couldn't be read just now." />;
  return (
    <>
      {/* said first, so nobody reads "paid" as something a visitor owes (the owner, 2026-11-11: "Users might think they have to pay to get something checked") */}
      <div className="ledger-lead">
        <b>Looking a card up is free for everyone.</b>
        Only AI agents (bots) pay for a check.
      </div>
      <div className="ledger-pay">
        <div>
          <p className="label">What an AI agent pays</p>
          <TermsFacts terms={terms} />
        </div>
        <p>No outside agent pays yet. On testnet, every check counted here is a test run.</p>
      </div>
      <p className="ledger-foot">
        <span>No record, no charge.</span>
        <Link href="/agents">For AI agents</Link>
      </p>
    </>
  );
}

/** A card's picture, small. A card the site has no picture of shows the start of its fingerprint as bars. */
function Thumb({ fp, image }: { fp: string; image?: string }) {
  return <span className="ledger-thumb">{image ? <Image src={image} alt="" width={144} height={81} /> : <Bars of={fp.slice(0, 24)} />}</span>;
}

/** What a row calls its card: the name the site has for it, if it has one, and the two ends of its fingerprint. */
function CardCell({ fp, label }: { fp: string; label?: string }) {
  return (
    <span className="ledger-card">
      {label && <b>{label}</b>}
      <span className="id" title={fp}>
        {shortFingerprint(fp)}
      </span>
    </span>
  );
}

/** A verdict in a row: its mark in the verdict's colour, then the word. */
function VerdictCell({ verdict, children }: { verdict: Verdict; children?: ReactNode }) {
  const Mark = MARK[verdict];
  return (
    <span className="ledger-verdict" data-verdict={verdict}>
      <Mark />
      {verdict}
      {children}
    </span>
  );
}

function CopyLink({ fp }: { fp: string }) {
  const [copied, copy] = useRecordLink(fp);
  return (
    <span aria-live="polite">
      <button type="button" className="link-btn" onClick={copy}>
        {copied ? "Link copied" : "Copy the link to this record"}
      </button>
    </span>
  );
}

const Count = ({ n, one, many }: { n: number; one: string; many: string }) => (
  <>
    <b>{n.toLocaleString("en-US")}</b> {n === 1 ? one : many}
  </>
);
