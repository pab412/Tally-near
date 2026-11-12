import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inNear } from "@/scripts/agent-rule.mjs";
import { HistoryError, addsUp, cardHistory, type CardEvent, type CardHistory } from "@/lib/card-history";
import { badgePath, isFingerprint, recordPath } from "@/lib/fingerprint";
import { CARD_CONTRACT_ID, CHECK_CONTRACT_ID, CONTRACT_ID, explorerAccountUrl, explorerTxUrl, formatMoment, latestRecord, shortFingerprint, verifiedCard, type Verdict } from "@/lib/near";
import { DocPage, Onward, PageHead, Section } from "../../doc-parts";
import { ExternalIcon } from "../../icons";
import { Fact, Finding, Frame, LiveTag, Note } from "../../parts";

// Everything on the page is read as it opens: the registry, the card contract, and the contract's receipts.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ fingerprint: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fingerprint } = await params;
  return { title: isFingerprint(fingerprint) ? `Verified card ${shortFingerprint(fingerprint)}: its history on NEAR` : "Verified card" };
}

/** A moment by UTC, since this page is drawn on the server and can't know the visitor's clock. */
const when = (ms: number) => `${formatMoment(ms, "UTC")} UTC`;
const near = (yocto: string) => `${inNear(yocto)} NEAR`;

/** One thing that happened to the card, in plain words. */
function said(e: CardEvent): { what: string; detail?: string; tone?: Verdict } {
  switch (e.kind) {
    case "minted":
      return { what: `Minted to ${e.account}`, detail: "The contract asked the registry first, and it said Real.", tone: "Real" };
    case "earned":
      return { what: `Paid in: ${near(e.yocto)}`, detail: e.from === CHECK_CONTRACT_ID ? "A share of a paid check's fee." : `Paid in by ${e.from || "an account"}.` };
    case "paid_out":
      return { what: `Paid out: ${near(e.yocto)}`, detail: "To its holder, while the registry still said Real." };
    case "rechecked":
      return { what: "A recheck was asked for", detail: "The contract asked the registry again." };
    case "burned":
      return { what: `Burned: ${e.account} no longer holds it`, tone: "Fake" };
  }
}

function Events({ history }: { history: CardHistory }) {
  return (
    <ol className="log">
      {history.events.map((e, i) => {
        const line = said(e);
        return (
          <li key={i} data-verdict={line.tone}>
            <p className="log-who">
              <time dateTime={new Date(e.atMs).toISOString()}>{when(e.atMs)}</time>
            </p>
            <p className="log-what">{line.what}</p>
            <p className="log-detail">
              {line.detail}{" "}
              <a href={explorerTxUrl(e.tx)} target="_blank" rel="noreferrer">
                Transaction <ExternalIcon />
              </a>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default async function CardPage({ params }: Props) {
  const { fingerprint } = await params;
  if (!isFingerprint(fingerprint)) notFound();

  const [record, held, history] = await Promise.all([
    latestRecord(fingerprint, { contractId: CONTRACT_ID }).then(
      (r) => ({ read: true as const, verdict: r?.latest.verdict ?? null }),
      () => ({ read: false as const, verdict: null }),
    ),
    verifiedCard(fingerprint).catch(() => undefined),
    cardHistory(fingerprint).catch((err: unknown) => (err instanceof HistoryError ? null : Promise.reject(err))),
  ]);
  const real = record.verdict === "Real";
  const sums = history && held ? addsUp(history, held.holdsYocto) : null;

  return (
    <DocPage current="cards">
      <PageHead title={`Verified card ${shortFingerprint(fingerprint)}`}>
        Who holds this badge, what it has earned from paid checks and what was paid out. All of it is read from NEAR as this page opens.
      </PageHead>

      <div className="split-cols card-page">
        <Frame title="What the contract holds" aside={<LiveTag>Read from NEAR</LiveTag>}>
          {held === undefined ? (
            <Note role="alert" head="The card contract couldn't be read just now.">
              <p>Try again in a moment.</p>
            </Note>
          ) : held ? (
            <>
              <Finding tone={real ? "Real" : "none"} word="Held">
                {real ? "The registry says this card is Real, so its badge stands." : "Its record no longer says Real. A recheck burns this badge."}
              </Finding>
              <dl className="facts">
                <Fact label="Holder">
                  <a className="account" href={explorerAccountUrl(held.holder)} target="_blank" rel="noreferrer">
                    {held.holder}
                  </a>
                </Fact>
                <Fact label="Since">
                  <time dateTime={new Date(held.mintedAtMs).toISOString()}>{when(held.mintedAtMs)}</time>
                </Fact>
                <Fact label="Holds now">{near(held.holdsYocto)}</Fact>
                {history && <Fact label="Paid in, in all">{near(history.earnedYocto)}</Fact>}
                {history && <Fact label="Paid out, in all">{near(history.paidOutYocto)}</Fact>}
                <Fact label="From check" mono>
                  {held.checkId}
                </Fact>
              </dl>
              {sums === true && <p>It adds up: paid in, less paid out, is what the contract says the card holds now.</p>}
              {sums === false && <p>The payments found don&apos;t add up to what the contract holds. The contract&apos;s number is the one that counts.</p>}
            </>
          ) : (
            <>
              <Finding tone="none" word="No verified card">
                {history?.holders.length ? "This card had a badge once. It was burned." : "This card has no badge."}
              </Finding>
              <p>
                {record.read ? (record.verdict ? `The registry says ${record.verdict} for this card.` : "The registry has no record of this card.") : "The registry couldn't be read just now."}{" "}
                <a href={recordPath(fingerprint)}>Open its record</a>
              </p>
            </>
          )}
        </Frame>

        {held && real ? (
          <div className="badge-art">
            {/* eslint-disable-next-line @next/next/no-img-element -- drawn fresh by /badge each time, so it's never a stale copy */}
            <img src={badgePath(fingerprint)} alt="This verified card's picture: the card with a Verified on NEAR stamp" width={1200} height={1200} />
            <p>The picture wallets and explorers show for this NFT.</p>
          </div>
        ) : (
          <div className="prose">
            <p>A verified card is a badge only a card the registry says is Real can have. It can&apos;t be sold or moved, and it is burned if the verdict is corrected.</p>
            <p>
              <a href="/verified-cards">How a card gets one</a>
            </p>
          </div>
        )}
      </div>

      <Section id="history" title="Its history">
        {history === null ? (
          <Note role="alert" head="The history couldn't be read just now.">
            <p>It comes from an index of NEAR&apos;s transactions, which didn&apos;t answer. What the contract holds, above, is read from NEAR itself.</p>
          </Note>
        ) : history.events.length ? (
          <>
            {history.holders.length > 0 && (
              <dl className="pairs">
                {history.holders.map((h, i) => (
                  <div key={i}>
                    <dt>
                      <a className="account" href={explorerAccountUrl(h.account)} target="_blank" rel="noreferrer">
                        {h.account}
                      </a>
                    </dt>
                    <dd>
                      Held it from {when(h.fromMs)} {h.toMs === null ? "and holds it now." : `to ${when(h.toMs)}.`}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="card-events">
              <Frame title="Everything that happened, oldest first" aside={<span>{history.events.length === 1 ? "1 entry" : `${history.events.length} entries`}</span>}>
                <Events history={history} />
              </Frame>
            </div>
            {!history.complete && <p className="muted">Only the contract&apos;s latest 100 payments were read, so older ones may be missing here.</p>}
          </>
        ) : (
          <p className="muted">Nothing has happened to this card on the card contract.</p>
        )}
        <p className="muted card-source">
          The history is the calls made to{" "}
          <a href={explorerAccountUrl(CARD_CONTRACT_ID)} target="_blank" rel="noreferrer">
            {CARD_CONTRACT_ID} <ExternalIcon />
          </a>{" "}
          on NEAR testnet, listed by an index of NEAR&apos;s transactions (powered by{" "}
          <a href="https://nearblocks.io" target="_blank" rel="noreferrer">
            Nearblocks.io APIs <ExternalIcon />
          </a>
          ). Holders are shown by their NEAR account names, which are already public on NEAR.
        </p>
      </Section>

      <Onward href={recordPath(fingerprint)} label="Open the record">
        The card&apos;s verdict, and every correction
      </Onward>
    </DocPage>
  );
}
