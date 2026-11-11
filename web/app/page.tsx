import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DEMO_PATH, recordPath } from "@/lib/fingerprint";
import { CARD_CONTRACT_ID, CONTRACT_ID, DEMO_RECORD_FP } from "@/lib/near";
import { sampleFingerprints } from "@/lib/sample";
import { ExternalIcon } from "./icons";
import { Contracts, Fingerprint, VerdictBar, Wordmark } from "./parts";
import { LiveCounts, LiveRecord } from "./live";

// The front page (the owner, 2026-11-10: the panther page is what people should see first). It explains the whole
// idea in plain words beside the real parts, and sends people on to the demo at /demo.
export const metadata: Metadata = {
  title: "Tally on NEAR: receipts nobody can edit",
  description:
    "Tally checks crypto PnL cards for fakes. On NEAR, every verdict is a public record nobody can edit, and a real card can earn a verified card that can't be bought.",
};

const REPO = "https://github.com/pab412/Tally-near";

// The example card is one of the page's own samples. Both fingerprints are computed from its real bytes when the
// site is built: the file as it is, and the same file with one byte changed.
const SAMPLE = "sample-card-b.png";
const { fingerprint: SAMPLE_FP, oneByteChanged: NUDGED_FP } = sampleFingerprints(SAMPLE);

/** One step of the walk-through: its number and title on a rule, then the words beside the thing they describe. */
function Step({ n, title, children, visual }: { n: number; title: string; children: React.ReactNode; visual: React.ReactNode }) {
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

/** A framed piece of the product shown as an illustration. Anything made up inside it is marked Example. */
function Exhibit({ example, children }: { example?: boolean; children: React.ReactNode }) {
  return (
    <div className="exhibit">
      {example && <span className="exhibit-tag">Example</span>}
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <div className="shell">
      <header className="topbar">
        <Wordmark />
        <nav className="topnav" aria-label="Pages">
          <Link className="btn-primary btn-small" href={DEMO_PATH}>
            Open the demo
          </Link>
        </nav>
      </header>

      <main className="doc">
        <section className="doc-hero">
          <div>
            <h1>Receipts nobody can edit.</h1>
            <p className="doc-lede">
              Tally checks crypto PnL cards for fakes. On NEAR, every verdict becomes a public record that nobody can change, Tally included. And a
              card that&apos;s real can earn a badge that can&apos;t be bought.
            </p>
            <p className="doc-cta">
              <Link className="btn-primary" href={DEMO_PATH}>
                Try the demo
              </Link>
              <a href={REPO} target="_blank" rel="noreferrer">
                Read the code <ExternalIcon />
              </a>
            </p>
          </div>
          {/* Tally's own panther, drawn for this page, holding a phone over its head with both paws. The card on the screen is a real Tally card
              drawn by Tally's own card code with made-up figures (its coin is $SAMPLE). */}
          <Image
            className="doc-art"
            src="/art/panther-holds-card.webp"
            alt="Tally's black panther holding a phone above its head with both paws; the screen shows a verified Tally PnL card for a sample trade"
            width={1800}
            height={1195}
            sizes="(max-width: 940px) 100vw, 900px"
            priority
          />
        </section>

        <section className="doc-band">
          <p>Anyone can post a screenshot of a 100x.</p>
          <p>
            Tally already checks those cards. But the verdict lived in Tally&apos;s own database, so you had to trust Tally not to change it. Now you
            don&apos;t have to.
          </p>
        </section>

        <Step
          n={1}
          title="A card becomes a fingerprint"
          visual={
            <Exhibit example>
              <div className="bay bay-still">
                <Image src={`/samples/${SAMPLE}`} alt="A made-up PnL card showing a 38.21% gain" width={1600} height={900} sizes="(max-width: 940px) 92vw, 620px" />
              </div>
              <div className="fingerprint">
                <p className="label">This card&apos;s fingerprint</p>
                <Fingerprint fp={SAMPLE_FP} />
              </div>
              <div className="fingerprint">
                <p className="label">The same file with one byte changed</p>
                <Fingerprint fp={NUDGED_FP} />
              </div>
            </Exhibit>
          }
        >
          <p>Your browser turns the picture into a 64-character code. The same picture always gives the same code.</p>
          <p>Change anything, even one pixel, and the whole code changes. So an edited card can&apos;t borrow a real card&apos;s record.</p>
          <p>The picture never leaves your device. Only the fingerprint goes to NEAR, and no name is ever attached to it.</p>
        </Step>

        <Step
          n={2}
          title="Tally's verdict is written on NEAR"
          visual={
            <Exhibit example>
              <div className="history">
                <p className="label">A card&apos;s history, oldest first</p>
                <ol>
                  <li>
                    <span className="verdict-dot" data-verdict="Fake" aria-hidden />
                    <span className="history-verdict">Fake</span>
                    <span className="history-id">k3x9q2</span>
                    <time>3 Nov 2026, 14:20</time>
                  </li>
                  <li data-latest>
                    <span className="verdict-dot" data-verdict="Real" aria-hidden />
                    <span className="history-verdict">Real</span>
                    <span className="history-id">k3x9q2-appeal</span>
                    <time>6 Nov 2026, 09:05</time>
                  </li>
                </ol>
              </div>
              <p className="exhibit-note">The trader appealed and won. The first verdict is still there for everyone to see.</p>
            </Exhibit>
          }
        >
          <p>When Tally finishes checking a card, it writes the fingerprint and the verdict to a contract on NEAR: Real, Unclear or Fake. NEAR adds the time.</p>
          <p>Nobody can delete or rewrite a record, Tally included.</p>
          <p>If a verdict turns out wrong, the correction is added on top. The earlier verdict stays in the history.</p>
        </Step>

        <Step
          n={3}
          title="Anyone can check it"
          visual={
            <Exhibit>
              <p className="label">A real record, read from NEAR just now</p>
              <LiveRecord fp={DEMO_RECORD_FP} contractId={CONTRACT_ID} />
              <p className="links">
                <Link href={recordPath(DEMO_RECORD_FP)}>Open this record in the demo</Link>
              </p>
            </Exhibit>
          }
        >
          <p>Drop a card on the demo page, or open the link from a Tally card&apos;s QR code. The answer comes straight from NEAR.</p>
          <p>No account, no wallet, and no Tally server in between.</p>
          <p>An AI agent can read the same record the same way, before it trusts a trader.</p>
        </Step>

        <Step
          n={4}
          title="A real card can earn a verified card"
          visual={
            <Exhibit example>
              <VerdictBar tone="Real" keyText="NFT" word="Held" />
              <div className="notice refusal">
                <p className="notice-head">The contract refused</p>
                <p>“Only a card the proof registry says is Real can be verified”</p>
              </div>
              <p className="exhibit-note">Top: a real card&apos;s badge. Bottom: what the contract answers when someone tries to mint one for a fake.</p>
            </Exhibit>
          }
        >
          <p>A verified card is an NFT the trader holds for a card Tally found Real. Three rules are built into the contract, so nobody has to take Tally&apos;s word for them:</p>
          <ul className="rules">
            <li>
              <strong>It&apos;s only minted for a Real card.</strong> The contract asks the record on NEAR itself before it mints.
            </li>
            <li>
              <strong>It can&apos;t be sold or moved.</strong> So a verified card can&apos;t be bought.
            </li>
            <li>
              <strong>It burns if the verdict changes.</strong> Anyone can ask for a recheck, and the contract removes a card that&apos;s no longer Real.
            </li>
          </ul>
        </Step>

        <section className="split" aria-labelledby="onchain">
          <h2 id="onchain">What goes on NEAR, and what never does</h2>
          <div className="split-cols">
            <div>
              <h3>On NEAR</h3>
              <ul className="ticks">
                <li>The card&apos;s fingerprint</li>
                <li>The verdict: Real, Unclear or Fake</li>
                <li>The time, set by NEAR</li>
                <li>Tally&apos;s id for the check</li>
                <li>For a verified card, the NEAR account that holds it</li>
              </ul>
            </div>
            <div>
              <h3>Never</h3>
              <ul className="ticks ticks-no">
                <li>The picture</li>
                <li>A name or a handle</li>
                <li>A wallet from another chain</li>
              </ul>
              <p className="muted">The contract refuses anything that isn&apos;t a fingerprint, so a name can&apos;t be slipped in.</p>
            </div>
          </div>
        </section>

        <section className="trio" aria-labelledby="why">
          <h2 id="why">What NEAR does here that a database can&apos;t</h2>
          <ul>
            <li>
              <h3>The record can&apos;t be edited</h3>
              <p>A verdict Tally could quietly change isn&apos;t proof. On NEAR it can only be added to.</p>
            </li>
            <li>
              <h3>The rules run themselves</h3>
              <p>Whether a card gets a badge, and when it loses it, is decided by the contract, not by Tally.</p>
            </li>
            <li>
              <h3>Anyone can read it</h3>
              <p>People, apps and AI agents can check a card without asking Tally for anything.</p>
            </li>
          </ul>
        </section>

        <section className="faq" aria-labelledby="faq">
          <h2 id="faq">Questions</h2>
          <details>
            <summary>Can Tally change a verdict later?</summary>
            <p>It can add a correction, which shows up as a new entry. It can&apos;t remove or rewrite the earlier one.</p>
          </details>
          <details>
            <summary>What if someone edits a real card?</summary>
            <p>Any edit changes the fingerprint, so the edited picture has no record. It shows as not checked.</p>
          </details>
          <details>
            <summary>Is my card picture uploaded anywhere?</summary>
            <p>No. The fingerprint is computed in your browser, and only the fingerprint is sent.</p>
          </details>
          <details>
            <summary>Who can mint a verified card?</summary>
            <p>Only Tally&apos;s own account can ask for one, and the contract still refuses unless the record on NEAR says Real.</p>
          </details>
          <details>
            <summary>Is this on NEAR mainnet?</summary>
            <p>It runs on NEAR testnet for the hackathon. The contracts are the ones that would go to mainnet.</p>
          </details>
          <details>
            <summary>What was built for the hackathon?</summary>
            <p>
              Everything on NEAR: both contracts and this site. Tally itself (reading cards and checking them) existed before and isn&apos;t part of the
              entry.
            </p>
          </details>
        </section>

        <section className="closing">
          <h2>See it for yourself</h2>
          <LiveCounts contractId={CONTRACT_ID} cardContractId={CARD_CONTRACT_ID} />
          <p className="doc-cta">
            <Link className="btn-primary" href={DEMO_PATH}>
              Try the demo
            </Link>
            <Link href={recordPath(DEMO_RECORD_FP)}>Open a real record</Link>
          </p>
        </section>
      </main>

      <Contracts contractId={CONTRACT_ID} cardContractId={CARD_CONTRACT_ID}>
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
