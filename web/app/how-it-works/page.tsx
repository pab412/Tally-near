import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { recordPath } from "@/lib/fingerprint";
import { CONTRACT_ID, DEMO_RECORD_FP, explorerAccountUrl } from "@/lib/near";
import { CONTRACT_TESTS } from "@/lib/repo-facts";
import { sampleFingerprints } from "@/lib/sample";
import { DocPage, Onward, PageHead, REPO, Row, Rows, Section, Step } from "../doc-parts";
import { ExternalIcon } from "../icons";
import { LiveRecord } from "../live";
import { OneByte } from "../motion";
import { ExampleTag, Frame, History, LiveTag } from "../parts";

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
      <PageHead title="How a screenshot becomes proof anyone can check.">
        Three steps. Tally checks the card and saves the verdict on NEAR, so you don&apos;t have to trust Tally not to change it.
      </PageHead>

      <Step
        n={1}
        title="Every card gets its own fingerprint"
        visual={
          <Frame title="From picture to fingerprint" aside={<ExampleTag />}>
            <div>
              <div className="bay bay-still">
                <Image src={`/samples/${SAMPLE}`} alt="A made-up PnL card showing a 38.21% gain" width={1600} height={900} sizes="(max-width: 940px) 92vw, 620px" priority />
              </div>
            </div>
            <OneByte fp={SAMPLE_FP} changed={NUDGED_FP} />
          </Frame>
        }
      >
        <p>Your browser turns the picture into a 64-character code. Change one pixel and the whole code changes.</p>
        <p>The picture never leaves your device.</p>
      </Step>

      <Step
        n={2}
        title="The proof is recorded on NEAR"
        visual={
          <Frame title="One card's history, oldest first" aside={<ExampleTag />}>
            <History entries={[...APPEAL]} timeZone="UTC" />
          </Frame>
        }
      >
        <p>Tally writes the fingerprint and the verdict to NEAR: Real, Unclear or Fake. Nobody can delete or rewrite it, Tally included.</p>
        <p>A correction is added on top. The earlier verdict stays.</p>
      </Step>

      <Step
        n={3}
        title="Checking doesn't depend on trusting Tally"
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
        <p>Drop a card on the demo page and the answer comes straight from NEAR.</p>
        <p>No account, no wallet, no Tally server in between.</p>
      </Step>

      <Section id="onchain" title="What goes on NEAR, and what never does">
        <div className="split-cols">
          <div>
            <h3>On NEAR</h3>
            <ul className="ticks">
              <li>The card&apos;s fingerprint</li>
              <li>The verdict</li>
              <li>The time, set by NEAR</li>
              <li>Tally&apos;s id for the check</li>
              <li>The NEAR account that holds a verified card</li>
            </ul>
          </div>
          <div>
            <h3>Never</h3>
            <ul className="ticks ticks-no">
              <li>The picture</li>
              <li>A name or a handle</li>
              <li>A wallet from another chain</li>
            </ul>
            <p className="muted">The contract refuses anything that isn&apos;t a fingerprint.</p>
          </div>
        </div>
      </Section>

      <Section id="details" title="Explore the technical details">
        <Rows>
          <Row title="The fingerprint is a SHA-256 hash">
            <p>
              It is the SHA-256 hash of the picture&apos;s exact bytes, written as 64 lower-case hex characters. Your browser computes it with its
              own built-in crypto.
            </p>
          </Row>
          <Row title="Image privacy">
            <p>The picture is read on your device and never uploaded. Only the fingerprint is sent to NEAR, and a fingerprint can&apos;t be turned back into the picture.</p>
          </Row>
          <Row title="Corrections and appeals">
            <p>
              A card&apos;s record is a list that only grows. A correction is a new entry on top, with its own check id and time. The latest entry
              is the verdict that stands, and every earlier one stays readable.
            </p>
          </Row>
          <Row title="The registry contract">
            <p>
              One method writes: <code>record</code>, which only Tally&apos;s account can call. The reads are free: <code>get</code>,{" "}
              <code>history</code>, <code>cards</code> and <code>attester</code>. It has {CONTRACT_TESTS.proof} unit tests.
            </p>
            <p>
              <a href={explorerAccountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">
                {CONTRACT_ID} <ExternalIcon />
              </a>{" "}
              ·{" "}
              <a href={`${REPO}/blob/main/contracts/proof/src/lib.rs`} target="_blank" rel="noreferrer">
                Its source on GitHub <ExternalIcon />
              </a>
            </p>
          </Row>
          <Row title="A link to any record">
            <p>
              Every record has its own link: <code>/demo?fp=</code> followed by the fingerprint. A Tally card&apos;s QR code can point to it.{" "}
              <Link href={recordPath(DEMO_RECORD_FP)}>Open one.</Link>
            </p>
          </Row>
        </Rows>
      </Section>

      <Onward href="/verified-cards" label="Verified cards">
        Next: what a real card can earn
      </Onward>
    </DocPage>
  );
}
