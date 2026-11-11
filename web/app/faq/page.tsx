import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_PATH } from "@/lib/fingerprint";
import { DocPage, Onward, PageHead } from "../doc-parts";

export const metadata: Metadata = {
  title: "Questions",
  description: "Short answers about Tally on NEAR: fingerprints, changing a verdict, privacy, verified cards, and what was built for the hackathon.",
};

export default function Questions() {
  return (
    <DocPage current="faq">
      <PageHead title="Questions">Short answers. The longer ones are on the other pages.</PageHead>

      <section className="faq" aria-label="Questions and answers">
        <details>
          <summary>What is a fingerprint?</summary>
          <p>
            A 64-character code your browser makes from a card&apos;s picture. The same picture always gives the same code, and any change gives a
            different one. <Link href="/how-it-works">See one on How it works.</Link>
          </p>
        </details>
        <details>
          <summary>Why NEAR, and not Tally&apos;s own database?</summary>
          <p>
            A verdict Tally could quietly change isn&apos;t proof. On NEAR a record can only be added to, the badge&apos;s rules run in a contract and not
            on Tally&apos;s say-so, and anyone can read it without asking Tally for anything.
          </p>
        </details>
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
          <summary>How does a trader earn from a verified card?</summary>
          <p>
            When an AI agent pays to check a card, part of the fee goes into that card&apos;s verified card. The trader can take it out while the
            card is still Real. If the card is found fake, the badge burns and what it held is lost. <Link href="/agents">See For AI agents.</Link>
          </p>
        </details>
        <details>
          <summary>Does it cost anything to look a card up?</summary>
          <p>No. Reading a record is free for people and for AI agents.</p>
        </details>
        <details>
          <summary>Why would an agent pay when reading is free?</summary>
          <p>
            For the receipt. A paid check leaves a public record on NEAR that this agent checked this card before it acted, which its owner can
            audit. The fee also pays the trader, and a paid check is what gets a badge burned once its verdict was corrected.
          </p>
        </details>
        <details>
          <summary>What stops an AI agent from overspending?</summary>
          <p>
            Its owner loads a small credit and gives it a key that can only pay for checks. NEAR refuses anything else that key tries, and the
            contract refuses a check once the credit is gone.
          </p>
        </details>
        <details>
          <summary>Is this on NEAR mainnet?</summary>
          <p>It runs on NEAR testnet for the hackathon. The contracts are the ones that would go to mainnet.</p>
        </details>
        <details>
          <summary>What was built for the hackathon?</summary>
          <p>
            Everything on NEAR: the three contracts and this site. Tally itself (reading cards and checking them) existed before and isn&apos;t part of the
            entry.
          </p>
        </details>
      </section>

      <Onward href={DEMO_PATH} label="Open the demo">
        Easier to see than to read
      </Onward>
    </DocPage>
  );
}
