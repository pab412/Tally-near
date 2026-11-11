import type { Metadata } from "next";
import { REFUSALS } from "@/lib/card-rules";
import { DEMO_PATH } from "@/lib/fingerprint";
import Link from "next/link";
import { DocPage, Exhibit, Onward, PageHead } from "../doc-parts";
import { Status, VerdictBar } from "../parts";

export const metadata: Metadata = {
  title: "Verified cards",
  description: "A verified card is an NFT for a PnL card Tally found real. It can't be sold, the contract only mints it for a real card, and it burns if the verdict changes.",
};

export default function VerifiedCards() {
  return (
    <DocPage current="cards">
      <PageHead title="Verified cards">
        A verified card is a badge for a PnL card Tally found real. It&apos;s an NFT on NEAR that the trader holds, and its rules are built into the
        contract, so nobody has to take Tally&apos;s word for them.
      </PageHead>

      <section className="split" aria-labelledby="rules">
        <h2 id="rules">Three rules, enforced by the contract</h2>
        <div className="split-cols">
          <ul className="rules">
            <li>
              <strong>It&apos;s only minted for a real card.</strong> Before it mints, the contract asks the record on NEAR itself and has to hear Real.
            </li>
            <li>
              <strong>It can&apos;t be sold or moved.</strong> It stays with the trader who earned it, so a verified card can&apos;t be bought.
            </li>
            <li>
              <strong>It burns if the verdict changes.</strong> Anyone can ask for a recheck, and the contract removes a card that&apos;s no longer Real.
            </li>
          </ul>
          <Exhibit example>
            <VerdictBar tone="Real" keyText="NFT" word="Held" />
            <p className="exhibit-note">What the demo shows for a card that has its verified card.</p>
          </Exhibit>
        </div>
      </section>

      <section className="split" aria-labelledby="earns">
        <h2 id="earns">
          And it earns <Status state="build" />
        </h2>
        <div className="split-cols">
          <div className="prose">
            <p>When an AI agent pays to check a card, part of the fee goes to the trader who holds that card&apos;s verified card.</p>
            <p>So a real trader is paid each time their record is checked, and has a reason to get every real card verified. A faker has no badge, so a faker earns nothing.</p>
          </div>
          <p className="split-note">
            This part isn&apos;t live yet. <Link href="/agents">See how the paid check will work.</Link>
          </p>
        </div>
      </section>

      <section className="split" aria-labelledby="path">
        <h2 id="path">How a card gets one</h2>
        <ol className="path">
          <li>
            <h3>Tally checks the card</h3>
            <p>The verdict, Real, is written to the record on NEAR.</p>
          </li>
          <li>
            <h3>Tally asks for the mint</h3>
            <p>The card contract doesn&apos;t take the request on trust. It looks the card up on NEAR first.</p>
          </li>
          <li>
            <h3>The trader holds it</h3>
            <p>It sits in the NEAR account the trader chose. They can give it up whenever they like; nobody else can take it.</p>
          </li>
        </ol>
      </section>

      <section className="split" aria-labelledby="refusals">
        <h2 id="refusals">What the contract refuses</h2>
        <p className="split-note">These are the contract&apos;s own answers, word for word. You can trigger the first two yourself in the demo.</p>
        <dl className="refusals">
          {REFUSALS.map((r) => (
            <div key={r.says}>
              <dt>{r.when}</dt>
              <dd>“{r.says}”</dd>
            </div>
          ))}
        </dl>
      </section>

      <Onward href={DEMO_PATH} label="Open the demo">
        See one minted, refused and burned
      </Onward>
    </DocPage>
  );
}
