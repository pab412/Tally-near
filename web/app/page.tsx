import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DEMO_PATH } from "@/lib/fingerprint";
import { CARD_CONTRACT_ID, CHECK_CONTRACT_ID, CONTRACT_ID, DEMO_RECORD_FP } from "@/lib/near";
import { sampleFingerprints } from "@/lib/sample";
import { DocPage, REPO } from "./doc-parts";
import { ExternalIcon } from "./icons";
import { Ledger, type KnownCard } from "./ledger";
import { SAMPLES, Status } from "./parts";

// The front page (the owner, 2026-11-10: the panther page is what people should see first, and "I dont like how
// everything is on the same page"): the headline, the three things this is, and the way on to each. The detail
// lives on its own pages. Under the three sits the ledger (the owner, 2026-11-11, of the ledger mock-up: "add this
// part to the main webpage underneath"): what the contracts hold right now, read from NEAR as the page opens.

// The cards the ledger can ask NEAR about by name: the registry keeps no list, so the site names the ones it knows.
// These are its own made-up samples, their fingerprints computed from the real files, and the README's example record.
const KNOWN: KnownCard[] = [
  ...SAMPLES.map(({ file, label }) => ({ fingerprint: sampleFingerprints(file).fingerprint, label, image: `/samples/${file}` })),
  { fingerprint: DEMO_RECORD_FP, label: "Demo record" },
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

      <section className="trio" aria-label="The three parts">
        <ul>
          <li>
            <Status />
            <h2>Every check is saved on NEAR</h2>
            <p>Real or fake, the verdict goes on NEAR. Nobody can edit or delete it.</p>
            <Link href="/how-it-works">How it works</Link>
          </li>
          <li>
            <Status />
            <h2>Real cards earn a badge</h2>
            <p>An NFT that can&apos;t be bought or faked. It burns if the verdict changes.</p>
            <Link href="/verified-cards">Verified cards</Link>
          </li>
          <li>
            <Status />
            <h2>AI agents pay to check</h2>
            <p>A bot pays a small fee, and part of it goes to the trader. People look cards up for free.</p>
            <Link href="/agents">For AI agents</Link>
          </li>
        </ul>
      </section>

      <Ledger contractId={CONTRACT_ID} cardContractId={CARD_CONTRACT_ID} checkContractId={CHECK_CONTRACT_ID} known={KNOWN} />
    </DocPage>
  );
}
