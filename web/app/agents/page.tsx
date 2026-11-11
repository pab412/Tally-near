import type { Metadata } from "next";
import { DEMO_PATH } from "@/lib/fingerprint";
import { CHECK_CONTRACT_ID, CONTRACT_ID, DEMO_RECORD_FP, RPC_URL, viewRequest } from "@/lib/near";
import { DocPage, Onward, PageHead, REPO } from "../doc-parts";
import { LiveAnswer, LiveTerms } from "../live";
import { ExampleTag, Frame, LiveTag, Status } from "../parts";

export const metadata: Metadata = {
  title: "For AI agents",
  description:
    "An AI agent can check whether a PnL card is real with one call to NEAR. Reading is free. A paid check runs on credit the agent's owner loaded, with a key that can do nothing else, and shares its fee with the trader.",
};

// The request printed on this page is built by the same function the site itself uses to read NEAR.
const REQUEST = JSON.stringify(viewRequest("get", { fingerprint: DEMO_RECORD_FP }, CONTRACT_ID));

// What `node scripts/demo-agent.mjs` printed on a test run, shortened to fit: the account names are swapped for plain
// ones and the links to each transaction are left out.
const RUN = `Tally demo agent, on NEAR testnet
Rule: copy a trader only if NEAR says
their card is Real.

1. The owner loads credit: 0.02 NEAR.
   That is all the agent can spend.
2. The agent gets its own key. It can
   call "check" and nothing else.

3. The agent checks 2 cards:
   cab484af…3be332b8  paid 0.01 NEAR
     NEAR says Fake
     DON'T COPY
   3171ca6c…36599e58  paid 0.01 NEAR
     NEAR says Real, and trader.testnet
     holds its verified card
     COPY
     0.005 NEAR of the fee went into
     the trader's verified card.

4. The agent tries to send 0.01 NEAR of
   the owner's money to another account.
   NEAR refuses.
5. The verified card now holds
   0.005 NEAR.
6. The owner takes the agent's key away.`;

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
          <div className="stack">
            <Frame title="The call">
              <pre className="code">
                <code>{`curl -s ${RPC_URL} \\\n  -H 'content-type: application/json' \\\n  -d '${REQUEST}'`}</code>
              </pre>
            </Frame>
            <Frame title="What NEAR answers" aside={<LiveTag>Read just now</LiveTag>}>
              <LiveAnswer fp={DEMO_RECORD_FP} contractId={CONTRACT_ID} />
            </Frame>
          </div>
        </div>
      </section>

      <section className="split" aria-labelledby="paid">
        <h2 id="paid">
          The paid check <Status state="soon" />
        </h2>
        <ol className="path">
          <li>
            <h3>The owner sets a limit</h3>
            <p>They load a little NEAR as credit, and give the agent a key that can only pay for checks.</p>
          </li>
          <li>
            <h3>The agent pays per answer</h3>
            <p>Each answer comes straight from the record on NEAR and costs one fee from that credit. No record, no charge.</p>
          </li>
          <li>
            <h3>The trader earns</h3>
            <p>If the card is Real and has a verified card, part of the fee goes into it. A faker has no badge and earns nothing.</p>
          </li>
        </ol>
        <div className="split-cols">
          <div className="stack">
            <Frame title="Run the demo agent yourself">
              <pre className="code">
                <code>{`git clone ${REPO}\ncd Tally-near/web && npm install\nnode scripts/demo-agent.mjs`}</code>
              </pre>
              <p>It makes its own throwaway testnet account, so there is nothing to set up. It is a script with one rule, not an AI.</p>
            </Frame>
            <Frame title="What a check costs" aside={<LiveTag>Read from NEAR just now</LiveTag>}>
              <LiveTerms contractId={CHECK_CONTRACT_ID} />
            </Frame>
          </div>
          <Frame title="What the demo agent prints" aside={<ExampleTag />}>
            <pre className="code">
              <code>{RUN}</code>
            </pre>
          </Frame>
        </div>
      </section>

      <section className="split" aria-labelledby="limit">
        <h2 id="limit">What the agent can and can&apos;t do</h2>
        <div className="split-cols">
          <div>
            <h3>It can</h3>
            <ul className="ticks">
              <li>Pay for a check, out of the credit its owner loaded</li>
              <li>Read any record for free</li>
            </ul>
            <p className="muted">
              Why pay when reading is free? For the receipt: a paid check leaves a public record on NEAR that this agent checked this card before
              it acted.
            </p>
          </div>
          <div>
            <h3>It can&apos;t</h3>
            <ul className="ticks ticks-no">
              <li>Send its owner&apos;s NEAR anywhere</li>
              <li>Call any other contract, or anything here but the check</li>
              <li>Spend more than the credit that was loaded</li>
              <li>Be charged for a card that has no record</li>
            </ul>
            <p className="muted">NEAR enforces the key and the contract enforces the credit. The owner can take back what&apos;s unspent at any time.</p>
          </div>
        </div>
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
              <li>A cut each time their real card is checked, paid into their badge</li>
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
