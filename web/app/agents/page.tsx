import type { Metadata } from "next";
import { DEMO_PATH } from "@/lib/fingerprint";
import { CONTRACT_ID, DEMO_RECORD_FP, RPC_URL, viewRequest } from "@/lib/near";
import { DocPage, Onward, PageHead } from "../doc-parts";
import { LiveAnswer } from "../live";
import { Status } from "../parts";

export const metadata: Metadata = {
  title: "For AI agents",
  description:
    "An AI agent can check whether a PnL card is real with one call to NEAR. Reading is free today; a paid check that shares its fee with the trader is being built.",
};

// The request printed on this page is built by the same function the site itself uses to read NEAR.
const REQUEST = JSON.stringify(viewRequest("get", { fingerprint: DEMO_RECORD_FP }, CONTRACT_ID));

export default function ForAgents() {
  return (
    <DocPage current="agents">
      <PageHead title="For AI agents">
        An AI agent that follows calls or copies trades has to know which traders are real. The answer is one call to NEAR, with no Tally server and no
        API key in between.
      </PageHead>

      <section className="split" aria-labelledby="read">
        <h2 id="read">
          Read a record, free <Status state="live" />
        </h2>
        <div className="split-cols">
          <div className="prose">
            <p>Ask the contract for a card&apos;s fingerprint. It answers with the verdict, Tally&apos;s id for the check and the time NEAR recorded it.</p>
            <p>The answer comes back as bytes of JSON. Nothing comes back for a card Tally has never checked.</p>
            <p>This costs nothing and needs no account. It is the same call this site makes.</p>
          </div>
          <div className="exhibit">
            <p className="label">The call</p>
            <pre className="code">
              <code>{`curl -s ${RPC_URL} \\\n  -H 'content-type: application/json' \\\n  -d '${REQUEST}'`}</code>
            </pre>
            <p className="label">What NEAR answers, read just now</p>
            <LiveAnswer fp={DEMO_RECORD_FP} contractId={CONTRACT_ID} />
          </div>
        </div>
      </section>

      <section className="split" aria-labelledby="paid">
        <h2 id="paid">
          The paid check <Status state="build" />
        </h2>
        <ol className="path">
          <li>
            <h3>The agent pays a small fee</h3>
            <p>It sends the card&apos;s fingerprint and the fee to the contract in one call.</p>
          </li>
          <li>
            <h3>NEAR answers</h3>
            <p>Real, Unclear or Fake, straight from the record. Nobody in the middle can change the answer.</p>
          </li>
          <li>
            <h3>The trader earns</h3>
            <p>If the card has a verified card, part of the fee goes to the trader who holds it. A faker has no badge and earns nothing.</p>
          </li>
        </ol>
      </section>

      <section className="split" aria-labelledby="both">
        <h2 id="both">What each side gets</h2>
        <div className="split-cols">
          <div>
            <h3>The agent</h3>
            <ul className="ticks">
              <li>An answer nobody could have edited</li>
              <li>The card&apos;s whole history, corrections included</li>
              <li>No account with Tally and no API key</li>
            </ul>
          </div>
          <div>
            <h3>The trader</h3>
            <ul className="ticks">
              <li>A cut each time their real card is checked</li>
              <li>A reason to get every real card verified</li>
              <li>A record they hold themselves, not one Tally keeps for them</li>
            </ul>
          </div>
        </div>
      </section>

      <Onward href={DEMO_PATH} label="Open the demo">
        Look a card up yourself
      </Onward>
    </DocPage>
  );
}
