// What the page's panels share: the picked card, the answer from NEAR, the verdict bar and the "switched off" notice.

import Link from "next/link";
import type { ReactNode } from "react";
import { explorerAccountUrl, type Lookup, type Verdict, type VerifiedCard } from "@/lib/near";
import { ExternalIcon, LockIcon } from "./icons";

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

export type PageId = "home" | "how" | "cards" | "faq" | "demo";

const PAGES: readonly { id: PageId; href: string; label: string }[] = [
  { id: "how", href: "/how-it-works", label: "How it works" },
  { id: "cards", href: "/verified-cards", label: "Verified cards" },
  { id: "faq", href: "/faq", label: "Questions" },
];

/** The top of every page: the name, the site's few pages, and the way into the demo. */
export function SiteHeader({ current }: { current: PageId }) {
  return (
    <header className="topbar">
      <Wordmark />
      <nav className="topnav" aria-label="Pages">
        {PAGES.map((page) => (
          <Link key={page.id} href={page.href} aria-current={current === page.id ? "page" : undefined}>
            {page.label}
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
      <div className="barcode" aria-hidden>
        {fp.split("").map((c, i) => (
          <i key={i} style={{ height: `${((parseInt(c, 16) + 2) / 17) * 100}%` }} />
        ))}
      </div>
    </>
  );
}

/** The foot of every page: where the contracts are. */
export function Contracts({ contractId, cardContractId, children }: { contractId: string; cardContractId: string; children?: ReactNode }) {
  return (
    <footer className="foot">
      <p>
        Contracts:{" "}
        <a href={explorerAccountUrl(contractId)} target="_blank" rel="noreferrer">
          {contractId} <ExternalIcon />
        </a>{" "}
        and{" "}
        <a href={explorerAccountUrl(cardContractId)} target="_blank" rel="noreferrer">
          {cardContractId} <ExternalIcon />
        </a>{" "}
        on NEAR testnet. Everything marked SAMPLE or Example is made up.
      </p>
      {children}
    </footer>
  );
}

/** The one loud thing on the page: a small key block and one big word, coloured by verdict. */
export function VerdictBar({ tone, keyText, word }: { tone: Verdict | "none"; keyText: string; word: string }) {
  return (
    <div className="verdict-bar" data-verdict={tone}>
      <span className="verdict-key">{keyText}</span>
      <span className="verdict-word">{word}</span>
    </div>
  );
}

/** Shown in place of a form when this copy of the page has no key for that kind of write. */
export function SwitchedOff({ head, children }: { head: string; children: ReactNode }) {
  return (
    <div className="notice">
      <p className="notice-head">
        <LockIcon /> {head}
      </p>
      <p>{children}</p>
      <a href={README} target="_blank" rel="noreferrer">
        Try it yourself <ExternalIcon />
      </a>
    </div>
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
