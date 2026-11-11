import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DEMO_PATH } from "@/lib/fingerprint";
import { CARD_CONTRACT_ID, CONTRACT_ID } from "@/lib/near";
import { DocPage, REPO } from "./doc-parts";
import { ExternalIcon } from "./icons";
import { LiveCounts } from "./live";
import { Status } from "./parts";

// The front page (the owner, 2026-11-10: the panther page is what people should see first, and "I dont like how
// everything is on the same page"): the headline, the three things this is, and the way on to each. The detail
// lives on its own pages.
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
            Tally catches fake crypto PnL cards. Every verdict is saved on NEAR, where nobody can change it, Tally included. A card that&apos;s real
            earns its trader a badge that can&apos;t be bought.
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
            <Status state="live" />
            <h2>Every check is saved on NEAR</h2>
            <p>Tally checks a PnL card and writes the verdict, real or fake, to NEAR. Nobody can edit or delete it, Tally included.</p>
            <Link href="/how-it-works">How it works</Link>
          </li>
          <li>
            <Status state="soon" />
            <h2>Real cards earn a badge</h2>
            <p>A real card earns its trader a verified card: an NFT that can&apos;t be bought or faked, and that burns if the verdict ever changes.</p>
            <Link href="/verified-cards">Verified cards</Link>
          </li>
          <li>
            <Status state="soon" />
            <h2>AI agents pay to check</h2>
            <p>Before an AI agent trusts a trader, it pays a small fee to check their card on NEAR. Part of the fee goes into the trader&apos;s badge.</p>
            <Link href="/agents">For AI agents</Link>
          </li>
        </ul>
      </section>

      <LiveCounts contractId={CONTRACT_ID} cardContractId={CARD_CONTRACT_ID} />
    </DocPage>
  );
}
