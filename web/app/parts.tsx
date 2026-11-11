// What the site's pages share: the header and foot, the framed panel, how a verdict and a record are shown, and the
// short messages inside a panel.

import Link from "next/link";
import type { ReactNode } from "react";
import {
  explorerAccountUrl,
  explorerTxUrl,
  formatMoment,
  shortFingerprint,
  type Lookup,
  type Proof,
  type ProofRecord,
  type Verdict,
  type VerifiedCard,
} from "@/lib/near";
import { CheckIcon, CrossIcon, ExternalIcon, InfoIcon, LockIcon, MinusIcon, QuestionIcon } from "./icons";

/** `preview` is null for a card opened from a link: there's a fingerprint, but no picture on this device. */
export type Card = { name: string; fp: string; preview: string | null; sample: boolean };

/** A card's verified card, none, or "unknown" when the card contract couldn't be read. */
export type Held = VerifiedCard | null | "unknown";

export type LookState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; result: Lookup; held: Held }
  | { phase: "error"; message: string };

export const README = "https://github.com/pab412/Tally-near#try-recording-yourself";

/** The site's own made-up cards (public/samples), and what each one shows. */
export const SAMPLES = [
  { file: "sample-card-a.png", label: "Sample A", hint: "Corrected once" },
  { file: "sample-card-b.png", label: "Sample B", hint: "Checked" },
  { file: "sample-card-c.png", label: "Sample C", hint: "Never checked" },
];

/** The site's name, top left on every page; it links to the front page. */
export function Wordmark() {
  return (
    <Link className="wordmark" href="/">
      {/* eslint-disable-next-line @next/next/no-img-element -- Tally's own logo, a small static file */}
      <img src="/tally-t.png" alt="" width={20} height={23} />
      Tally <span>on NEAR</span>
    </Link>
  );
}

export type PageId = "home" | "how" | "cards" | "agents" | "faq" | "demo";

// `short` is the name on a phone, where the whole menu has to fit one row
const PAGES: readonly { id: PageId; href: string; label: string; short?: string }[] = [
  { id: "how", href: "/how-it-works", label: "How it works" },
  { id: "cards", href: "/verified-cards", label: "Verified cards", short: "Cards" },
  { id: "agents", href: "/agents", label: "For AI agents", short: "AI agents" },
  { id: "faq", href: "/faq", label: "Questions", short: "FAQ" },
];

/** Marks a part as live. A part only gets it once its contract answers at its testnet address. */
export function Status() {
  return <span className="status">Live on testnet</span>;
}

/** The top of every page: the name, the site's few pages, and the way into the demo. */
export function SiteHeader({ current }: { current: PageId }) {
  return (
    <header className="topbar">
      <Wordmark />
      <nav className="topnav" aria-label="Pages">
        {PAGES.map((page) => (
          <Link key={page.id} href={page.href} aria-current={current === page.id ? "page" : undefined}>
            <span className={page.short && "nav-long"}>{page.label}</span>
            {page.short && <span className="nav-short">{page.short}</span>}
          </Link>
        ))}
        <Link className="btn-primary btn-small" href="/demo" aria-current={current === "demo" ? "page" : undefined}>
          {current === "demo" ? (
            "Demo"
          ) : (
            <>
              <span className="nav-long">Open the demo</span>
              <span className="nav-short">Demo</span>
            </>
          )}
        </Link>
      </nav>
    </header>
  );
}

/** A fingerprint as the page shows it: the 64 characters in eight groups, and the same characters as bars. */
export function Fingerprint({ fp }: { fp: string }) {
  return (
    <>
      <p className="hash" aria-label={fp}>
        {fp.match(/.{8}/g)!.map((group, i) => (
          <span key={i} aria-hidden>
            {group}
          </span>
        ))}
      </p>
      <Bars of={fp} />
    </>
  );
}

/** A fingerprint's characters as bars: the higher the character, the taller its bar. */
export function Bars({ of }: { of: string }) {
  return (
    <span className="barcode" aria-hidden>
      {of.split("").map((c, i) => (
        <i key={i} style={{ height: `${((parseInt(c, 16) + 2) / 17) * 100}%` }} />
      ))}
    </span>
  );
}

/** The foot of every page: where the contracts are. */
export function Contracts({ ids, children }: { ids: readonly string[]; children?: ReactNode }) {
  return (
    <footer className="foot">
      <p>
        Contracts:{" "}
        {ids.map((id, i) => (
          <span key={id}>
            {i > 0 && (i === ids.length - 1 ? " and " : ", ")}
            <a href={explorerAccountUrl(id)} target="_blank" rel="noreferrer">
              {id} <ExternalIcon />
            </a>
          </span>
        ))}{" "}
        on NEAR testnet. Everything marked SAMPLE or Example is made up.
      </p>
      {children}
    </footer>
  );
}

/** A verdict, or "none" where there isn't one. It picks the colour and the mark. */
export type Tone = Verdict | "none";

export const MARK = { Real: CheckIcon, Fake: CrossIcon, Unclear: QuestionIcon, none: MinusIcon };

/** A framed block of the product: a title bar saying what it is and where it's from, then its sections. */
export function Frame({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="frame">
      <div className="frame-head">
        <p>{title}</p>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** In a frame's title bar: what's inside is made up. */
export const ExampleTag = () => <span className="tag">Example</span>;

/** In a frame's title bar: what's inside was read from NEAR while the page was open. */
export function LiveTag({ children }: { children: ReactNode }) {
  return (
    <span className="live">
      <span className="dot" aria-hidden /> {children}
    </span>
  );
}

/** What was found, at a glance: a mark in the verdict's colour, one word, and a sentence saying what it means. */
export function Finding({ tone, word, icon, children }: { tone: Tone; word: string; icon?: ReactNode; children?: ReactNode }) {
  const Mark = MARK[tone];
  return (
    <div className="finding" data-verdict={tone}>
      <span className="finding-mark">{icon ?? <Mark />}</span>
      <p className="finding-word">{word}</p>
      {children && <p className="finding-sub">{children}</p>}
    </div>
  );
}

/** One row of a facts table. `mono` is for what comes off the chain. */
export function Fact({ label, mono, title, children }: { label: string; mono?: boolean; title?: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "id" : undefined} title={title}>
        {children}
      </dd>
    </div>
  );
}

/** What NEAR holds for a card, as a table. Rows passed in are added at the end. */
export function RecordFacts({ record, contractId, txHash, children }: { record: ProofRecord; contractId: string; txHash?: string; children?: ReactNode }) {
  const { latest } = record;
  return (
    <dl className="facts">
      <Fact label="Fingerprint" mono title={record.fingerprint}>
        {shortFingerprint(record.fingerprint)}
      </Fact>
      <Fact label="Recorded">
        <time dateTime={new Date(latest.recorded_at_ms).toISOString()}>{formatMoment(latest.recorded_at_ms)}</time>{" "}
        <span className="muted">by NEAR&apos;s clock</span>
      </Fact>
      <Fact label="Check ID" mono>
        {latest.check_id}
      </Fact>
      <Fact label={txHash ? "Transaction" : "Contract"}>
        <a href={txHash ? explorerTxUrl(txHash) : explorerAccountUrl(contractId)} target="_blank" rel="noreferrer">
          {txHash ? "View on the NEAR explorer" : contractId} <ExternalIcon />
        </a>
      </Fact>
      {children}
    </dl>
  );
}

/** Every verdict a card has had, oldest first. The last one is the one that stands. */
export function History({ entries, timeZone }: { entries: Proof[]; timeZone?: string }) {
  return (
    <ol className="history">
      {entries.map((p, i) => {
        const Mark = MARK[p.verdict];
        return (
          <li key={i} data-verdict={p.verdict} data-latest={i === entries.length - 1 || undefined}>
            <Mark />
            <span>{p.verdict}</span>
            <span className="id">{p.check_id}</span>
            <time dateTime={new Date(p.recorded_at_ms).toISOString()}>{formatMoment(p.recorded_at_ms, timeZone)}</time>
          </li>
        );
      })}
    </ol>
  );
}

/** A short message inside a panel: a mark, the words, and any action. A tone colours it; without one it's plain. */
export function Note({
  tone,
  icon,
  head,
  role,
  children,
}: {
  tone?: Verdict;
  icon?: ReactNode;
  head?: string;
  role?: "alert" | "status";
  children?: ReactNode;
}) {
  const Mark = tone ? MARK[tone] : InfoIcon;
  return (
    <div className="note" data-verdict={tone} role={role}>
      {icon ?? <Mark />}
      <div>
        {head && <p className="note-head">{head}</p>}
        {children}
      </div>
    </div>
  );
}

/** Shown while NEAR is being asked. */
export function Busy({ children }: { children: ReactNode }) {
  return (
    <p className="busy" role="status">
      {children}
    </p>
  );
}

/** Shown in place of a form when this copy of the page has no key for that kind of write. */
export function SwitchedOff({ head, children }: { head: string; children: ReactNode }) {
  return (
    <Note icon={<LockIcon />} head={head}>
      <p>{children}</p>
      <a href={README} target="_blank" rel="noreferrer">
        Try it yourself <ExternalIcon />
      </a>
    </Note>
  );
}

/** Sends one of the demo's writes to the server. Answers the JSON body, or the message to show. */
export async function send<T>(path: string, body: object): Promise<{ ok: true; body: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, message: json.error ?? "That didn't work. Try again." };
    return { ok: true, body: json as T };
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach the server. Check your connection and try again." };
  }
}
