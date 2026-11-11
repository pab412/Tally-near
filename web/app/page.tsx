import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DEMO_PATH } from "@/lib/fingerprint";
import { CARD_CONTRACT_ID, CHECK_CONTRACT_ID, CONTRACT_ID, DEMO_RECORD_FP, explorerAccountUrl } from "@/lib/near";
import { CONTRACT_TESTS, CONTRACT_UNIT_TESTS, TESTNET_CHECKS } from "@/lib/repo-facts";
import { sampleFingerprints } from "@/lib/sample";
import { DocPage, Onward, REPO, Row, Rows, Section } from "./doc-parts";
import { ExternalIcon } from "./icons";
import { Ledger, type KnownCard } from "./ledger";
import { SAMPLES, Status } from "./parts";

// The front page (the owner, 2026-11-10: "the panther page is what people should see first"). Under the panther it
// goes in the order a judge reads (the owner, 2026-11-11, of the redesign mock-up: "do the reorganizing like on the
// mockup"): the problem, the fix, the three parts, the ledger read from NEAR as the page opens, then plainly what is
// live today and what isn't. Each block is a line or two; the detail lives on its own pages.

// The cards the ledger can ask NEAR about by name: the registry keeps no list, so the site names the ones it knows.
// These are its own made-up samples, their fingerprints computed from the real files, and the README's example record.
const KNOWN: KnownCard[] = [
  ...SAMPLES.map(({ file, label }) => ({ fingerprint: sampleFingerprints(file).fingerprint, label, image: `/samples/${file}` })),
  { fingerprint: DEMO_RECORD_FP, label: "Demo record" },
];

// The three contracts, and what each one keeps.
const CONTRACTS = [
  { id: CONTRACT_ID, name: "Proof registry", holds: "Every check: a fingerprint, a verdict and the time.", tests: CONTRACT_TESTS.proof },
  { id: CARD_CONTRACT_ID, name: "Verified cards", holds: "The NFT a real card can earn, and the money it holds.", tests: CONTRACT_TESTS.card },
  { id: CHECK_CONTRACT_ID, name: "Paid check", holds: "Each agent's credit, and the fee for a check.", tests: CONTRACT_TESTS.check },
];

export const metadata: Metadata = {
  title: "Tally on NEAR: receipts nobody can edit",
  description:
    "Tally checks crypto PnL cards for fakes. On NEAR, every verdict is a public record nobody can edit, and a real card can earn a verified card that can't be bought.",
};

export default function Home() {
  return (
    <DocPage current="home">
      <section className="doc-hero">
        <div>
          <h1>Receipts nobody can edit.</h1>
          <p className="doc-lede">
            Tally catches fake crypto PnL cards. Every verdict is saved on NEAR, where nobody can change it, Tally included.
          </p>
          <p className="doc-cta">
            <Link className="btn-primary" href={DEMO_PATH}>
              Try the demo
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer">
              Read the code <ExternalIcon />
            </a>
          </p>
          <p className="doc-fine">Running on NEAR testnet with sample cards. Tally&apos;s own checks are not written to NEAR yet.</p>
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

      <Section id="problem" kicker="The problem" title="A screenshot is not proof.">
        <ul className="trio">
          <li>
            <h3>Anyone can post a fake PnL card</h3>
            <p>A screenshot of a 100x takes a minute to make.</p>
          </li>
          <li>
            <h3>Screenshots are easy to edit</h3>
            <p>Change one number and the card still looks real.</p>
          </li>
          <li>
            <h3>One company&apos;s verdict needs trust</h3>
            <p>A verdict kept in Tally&apos;s own database is only as good as Tally&apos;s word.</p>
          </li>
        </ul>
      </Section>

      <Section id="fix" kicker="The fix" title="From a picture to proof anyone can check.">
        <ol className="path">
          <li>
            <h3>The card becomes a fingerprint</h3>
            <p>Made in your browser. The picture never leaves your device.</p>
          </li>
          <li>
            <h3>Tally gives one verdict</h3>
            <p>Real, Unclear or Fake.</p>
          </li>
          <li>
            <h3>The verdict is written to NEAR</h3>
            <p>Corrections are added on top. Nothing is removed, by Tally or anyone else.</p>
          </li>
        </ol>
      </Section>

      <Section id="parts" kicker="What you get" title="Three parts, each live on testnet.">
        <ul className="trio">
          <li>
            <Status />
            <h3>Every check is saved on NEAR</h3>
            <p>Real or fake, the verdict goes on NEAR. Nobody can edit or delete it.</p>
            <Link href="/how-it-works">How it works</Link>
          </li>
          <li>
            <Status />
            <h3>Real cards earn a badge</h3>
            <p>An NFT that can&apos;t be bought or faked. It burns if the verdict changes.</p>
            <Link href="/verified-cards">Verified cards</Link>
          </li>
          <li>
            <Status />
            <h3>AI agents pay to check</h3>
            <p>A bot pays a small fee, and part of it goes to the trader. People look cards up for free.</p>
            <Link href="/agents">For AI agents</Link>
          </li>
        </ul>
      </Section>

      <Ledger contractId={CONTRACT_ID} cardContractId={CARD_CONTRACT_ID} checkContractId={CHECK_CONTRACT_ID} known={KNOWN} />

      <Section id="standing" kicker="Where it stands" title="What is live today, and what isn't.">
        <dl className="stats">
          <div>
            <dt>Contracts on NEAR testnet</dt>
            <dd>{CONTRACTS.length}</dd>
          </div>
          <div>
            <dt>Contract unit tests</dt>
            <dd>{CONTRACT_UNIT_TESTS}</dd>
          </div>
          <div>
            <dt>Checks run on testnet, end to end</dt>
            <dd>{TESTNET_CHECKS}</dd>
          </div>
        </dl>
        <div className="split-cols">
          <div>
            <h3>Live today</h3>
            <ul className="ticks">
              <li>The three contracts, on NEAR testnet</li>
              <li>This site and its demo, reading NEAR straight from your browser</li>
              <li>A demo agent that pays for checks with a key that can do nothing else</li>
            </ul>
          </div>
          <div>
            <h3>Not built yet</h3>
            <ul className="ticks ticks-no">
              <li>Tally&apos;s own checks written to NEAR. The records today are sample cards.</li>
              <li>NEAR mainnet</li>
              <li>Outside agents paying for checks. No outside agent pays yet.</li>
            </ul>
          </div>
        </div>
        <Rows>
          <Row title="The three contracts">
            <dl className="pairs">
              {CONTRACTS.map((c) => (
                <div key={c.id}>
                  <dt>
                    {c.name}
                    <a className="id" href={explorerAccountUrl(c.id)} target="_blank" rel="noreferrer">
                      {c.id} <ExternalIcon />
                    </a>
                  </dt>
                  <dd>
                    {c.holds} <span className="muted">{c.tests} unit tests.</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Row>
          <Row title="What existed before the hackathon">
            <p>Tally itself: the website, the card reading and the checks. None of that is part of this entry.</p>
            <p>Everything on NEAR was built for the hackathon: the three contracts and this site.</p>
          </Row>
          <Row title="What you still have to trust">
            <p>
              <strong>The verdict is Tally&apos;s.</strong> NEAR makes a verdict permanent and public. It doesn&apos;t make it right.
            </p>
            <p>
              <strong>The contract accounts still have their deploy keys.</strong> Whoever holds one could replace the code. Deleting them is the step
              before mainnet.
            </p>
            <p>
              <strong>The paid check is a choice.</strong> Records are public, so an agent can read them for free.
            </p>
            <p>
              <strong>The badge picture is drawn by this site.</strong> The record on NEAR is what counts.
            </p>
            <p>
              <a href={`${REPO}#what-you-still-have-to-trust`} target="_blank" rel="noreferrer">
                The full list, in the README <ExternalIcon />
              </a>
            </p>
          </Row>
        </Rows>
      </Section>

      <Onward href={DEMO_PATH} label="Open the demo">
        See a record for yourself
      </Onward>
    </DocPage>
  );
}
