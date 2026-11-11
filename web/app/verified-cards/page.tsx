import type { Metadata } from "next";
import { REFUSALS } from "@/lib/card-rules";
import { DEMO_PATH } from "@/lib/fingerprint";
import Image from "next/image";
import Link from "next/link";
import { DocPage, Onward, PageHead } from "../doc-parts";
import { ExampleTag, Frame, Status } from "../parts";

export const metadata: Metadata = {
  title: "Verified cards",
  description: "A verified card is an NFT for a PnL card Tally found real. It can't be sold, the contract only mints it for a real card, and it burns if the verdict changes.",
};

export default function VerifiedCards() {
  return (
    <DocPage current="cards">
      <PageHead title="Verified cards">
        A badge for a PnL card Tally found real: an NFT on NEAR that the trader holds. Its rules are built into the contract, so nobody has to take
        Tally&apos;s word.
      </PageHead>

      <section className="split" aria-labelledby="rules">
        <h2 id="rules">Three rules, enforced by the contract</h2>
        <div className="split-cols split-mid">
          <ul className="rules">
            <li>
              <strong>It&apos;s only minted for a real card.</strong> The contract asks the record on NEAR itself.
            </li>
            <li>
              <strong>It can&apos;t be sold or moved.</strong> So it can&apos;t be bought.
            </li>
            <li>
              <strong>It burns if the verdict changes.</strong> Anyone can ask for a recheck.
            </li>
          </ul>
          <Frame title="What the trader holds" aside={<ExampleTag />}>
            <div className="badge-art">
              <Image
                src="/art/verified-badge-example.png"
                alt="A badge picture: a Tally PnL card with a green Verified on NEAR stamp, the card's code and the date it was recorded"
                width={1200}
                height={1200}
                sizes="(max-width: 940px) 92vw, 520px"
                loading="eager"
              />
            </div>
            <p>The trader&apos;s own Tally card with a stamp. Wallets and explorers show it for the NFT.</p>
          </Frame>
        </div>
      </section>

      <section className="split" aria-labelledby="earns">
        <h2 id="earns">
          And it holds money <Status />
        </h2>
        <div className="split-cols">
          <div className="prose">
            <p>When an AI agent pays to check a card, part of the fee goes into the card&apos;s badge. A faker has no badge and earns nothing.</p>
            <p>
              <Link href="/agents">See how the paid check works.</Link>
            </p>
          </div>
          <ul className="rules">
            <li>
              <strong>The trader takes it out while the card is Real.</strong>
            </li>
            <li>
              <strong>A badge that burns loses what it held.</strong> Nobody gets that money, Tally included.
            </li>
          </ul>
        </div>
      </section>

      <section className="split" aria-labelledby="path">
        <h2 id="path">How a card gets one</h2>
        <ol className="path">
          <li>
            <h3>Tally checks the card</h3>
            <p>The verdict, Real, is written to NEAR.</p>
          </li>
          <li>
            <h3>Tally asks for the mint</h3>
            <p>The contract looks the card up on NEAR first.</p>
          </li>
          <li>
            <h3>The trader holds it</h3>
            <p>In the NEAR account they chose. Nobody else can take it.</p>
          </li>
        </ol>
      </section>

      {/* the contract's own answers: there for whoever wants them, closed until opened */}
      <details className="more">
        <summary>What the contract refuses, word for word</summary>
        <dl className="refusals">
          {REFUSALS.map((r) => (
            <div key={r.says}>
              <dt>{r.when}</dt>
              <dd>“{r.says}”</dd>
            </div>
          ))}
        </dl>
      </details>

      <Onward href={DEMO_PATH} label="Open the demo">
        See one minted, refused and burned
      </Onward>
    </DocPage>
  );
}
