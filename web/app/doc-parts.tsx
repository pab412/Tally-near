// What the site's reading pages share: the page frame, a page's title, a numbered step and the way onward.

import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { CARD_CONTRACT_ID, CHECK_CONTRACT_ID, CONTRACT_ID } from "@/lib/near";
import { ExternalIcon } from "./icons";
import { Contracts, SiteHeader, type PageId } from "./parts";

export const REPO = "https://github.com/pab412/Tally-near";

/** A reading page: the site's header, the page, and the foot. */
export function DocPage({ current, children }: { current: PageId; children: ReactNode }) {
  return (
    <div className="shell">
      <SiteHeader current={current} />
      <ViewTransition enter="page-in" exit="page-out" default="none">
        <main className="doc">{children}</main>
      </ViewTransition>
      <Contracts ids={[CONTRACT_ID, CARD_CONTRACT_ID, CHECK_CONTRACT_ID]}>
        <p>
          Built for the NEAR Hackathon, November 2026.{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            Source on GitHub <ExternalIcon />
          </a>
        </p>
      </Contracts>
    </div>
  );
}

/** The title of an inner page and the sentence or two that says what it covers. */
export function PageHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      <p className="doc-lede">{children}</p>
    </header>
  );
}

/** One step of a walk-through: its number and title on a rule, then the words beside the thing they describe. */
export function Step({ n, title, children, visual }: { n: number; title: string; children: ReactNode; visual: ReactNode }) {
  return (
    <section className="step" aria-labelledby={`step-${n}`}>
      <header>
        <span aria-hidden>{n}</span>
        <h2 id={`step-${n}`}>{title}</h2>
      </header>
      <div className="step-body">
        <div className="prose">{children}</div>
        <div className="step-visual">{visual}</div>
      </div>
    </section>
  );
}

/**
 * One block of a reading page: its title on a rule, then what it holds. `kicker` is the few words above the title
 * that say which part of the page this is; `id` is also the block's link (`/agents#developers`).
 */
export function Section({ id, kicker, title, children }: { id: string; kicker?: string; title: ReactNode; children: ReactNode }) {
  return (
    <section className="split" id={id} aria-labelledby={`${id}-title`}>
      {kicker && <p className="kicker">{kicker}</p>}
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}

/** Detail for whoever wants it: rows that stay closed until opened. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="rows">{children}</div>;
}

/** One of those rows: its title, and what opening it shows. */
export function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

/** The foot of a reading page: where to go next. */
export function Onward({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link className="onward" href={href}>
      <span>{children}</span>
      <strong>{label}</strong>
    </Link>
  );
}
