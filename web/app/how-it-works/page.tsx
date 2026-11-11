import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { recordPath } from "@/lib/fingerprint";
import { CONTRACT_ID, DEMO_RECORD_FP } from "@/lib/near";
import { sampleFingerprints } from "@/lib/sample";
import { DocPage, Onward, PageHead, Step } from "../doc-parts";
import { LiveRecord } from "../live";
import { ExampleTag, Fingerprint, Frame, History, LiveTag } from "../parts";

export const metadata: Metadata = {
  title: "How it works",
  description: "A PnL card becomes a fingerprint, Tally's verdict is written on NEAR, and anyone can check it. What goes on NEAR and what never does.",
};

// The example card is one of the site's own samples. Both fingerprints are computed from its real bytes when the
// site is built: the file as it is, and the same file with one byte changed.
const SAMPLE = "sample-card-b.png";
const { fingerprint: SAMPLE_FP, oneByteChanged: NUDGED_FP } = sampleFingerprints(SAMPLE);

// A made-up history for step 2: a verdict, then the correction added on top of it.
const APPEAL = [
  { verdict: "Fake", check_id: "k3x9q2", recorded_at_ms: Date.UTC(2026, 10, 3, 14, 20) },
  { verdict: "Real", check_id: "k3x9q2-appeal", recorded_at_ms: Date.UTC(2026, 10, 6, 9, 5) },
] as const;

export default function HowItWorks() {
  return (
    <DocPage current="how">
      <PageHead title="How it works">
        Anyone can post a screenshot of a 100x. Tally already checks those cards, but the verdict lived in Tally&apos;s own database, so you had to trust
        Tally not to change it. Now you don&apos;t have to.
      </PageHead>

      <Step
        n={1}
        title="A card becomes a fingerprint"
        visual={
          <Frame title="From picture to fingerprint" aside={<ExampleTag />}>
            <div>
              <div className="bay bay-still">
                <Image src={`/samples/${SAMPLE}`} alt="A made-up PnL card showing a 38.21% gain" width={1600} height={900} sizes="(max-width: 940px) 92vw, 620px" priority />
              </div>
            </div>
            <div className="fingerprint">
              <p className="label">This card&apos;s fingerprint</p>
              <Fingerprint fp={SAMPLE_FP} />
            </div>
            <div className="fingerprint">
              <p className="label">The same file with one byte changed</p>
              <Fingerprint fp={NUDGED_FP} />
            </div>
          </Frame>
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
          <Frame title="One card's history, oldest first" aside={<ExampleTag />}>
            <History entries={[...APPEAL]} timeZone="UTC" />
            <p>The trader appealed and won. The first verdict is still there for everyone to see.</p>
          </Frame>
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
          <Frame title="Proof record" aside={<LiveTag>Read from NEAR just now</LiveTag>}>
            <LiveRecord fp={DEMO_RECORD_FP} contractId={CONTRACT_ID} />
            <p className="frame-foot">
              <Link className="btn-secondary" href={recordPath(DEMO_RECORD_FP)}>
                Open this record in the demo
              </Link>
            </p>
          </Frame>
        }
      >
        <p>Drop a card on the demo page, or open the link from a Tally card&apos;s QR code. The answer comes straight from NEAR.</p>
        <p>No account, no wallet, and no Tally server in between.</p>
        <p>An AI agent can read the same record the same way, before it trusts a trader.</p>
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

      <Onward href="/verified-cards" label="Verified cards">
        Next: what a real card can earn
      </Onward>
    </DocPage>
  );
}
