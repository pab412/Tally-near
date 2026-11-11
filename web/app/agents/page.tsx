import type { Metadata } from "next";
import { ANSWER_FIELDS, ERRORS, PAID_METHODS } from "@/lib/agent-api";
import { DEMO_PATH } from "@/lib/fingerprint";
import { CARD_CONTRACT_ID, CHECK_CONTRACT_ID, CONTRACT_ID, RPC_URL, explorerAccountUrl } from "@/lib/near";
import { CONTRACT_TESTS, TESTNET_CHECKS } from "@/lib/repo-facts";
import { sampleFingerprints } from "@/lib/sample";
import { DocPage, Onward, PageHead, REPO, Row, Rows, Section } from "../doc-parts";
import { ExternalIcon } from "../icons";
import { LiveTerms } from "../live";
import { MethodExplorer } from "../method-explorer";
import { ExampleTag, Fact, Frame, LiveTag, Status } from "../parts";

export const metadata: Metadata = {
  title: "For AI agents",
  description:
    "An AI agent can check whether a PnL card is real with one call to NEAR. Reading is free. A paid check runs on credit the agent's owner loaded, with a key that can do nothing else, and shares its fee with the trader.",
};

// The card the read methods ask about: the site's sample card A, which was recorded Fake and then corrected, so its
// history has two entries. The fingerprint is computed from the real file.
const EXAMPLE_FP = sampleFingerprints("sample-card-a.png").fingerprint;

const CONTRACTS = { proof: CONTRACT_ID, check: CHECK_CONTRACT_ID };
const CONTRACT_NAMES = { proof: "The proof registry", check: "The paid check" };

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

const account = (id: string) => (
  <a href={explorerAccountUrl(id)} target="_blank" rel="noreferrer">
    {id} <ExternalIcon />
  </a>
);

export default function ForAgents() {
  return (
    <DocPage current="agents">
      <PageHead title="Verification an agent can read for itself.">
        Looking a card up is free for everyone. Only AI agents pay for a check, and no outside agent pays yet.
      </PageHead>
      <p className="jump">
        <a href="#operators">For AI operators</a>
        <a href="#developers">For developers</a>
      </p>

      <Section id="operators" kicker="For AI operators" title="Know which traders are real before your agent acts.">
        <div className="split-cols">
          <ul className="rules">
            <li>
              <strong>Check a claim before acting on it.</strong> One call says Real, Unclear, Fake or never checked.
            </li>
            <li>
              <strong>Read the proof straight from NEAR.</strong> No Tally server and no API key in between.
            </li>
          </ul>
          <ul className="rules">
            <li>
              <strong>Set a spending limit.</strong> The credit you load is all the agent can ever spend.
            </li>
            <li>
              <strong>Audit what it checked.</strong> Every paid check leaves a public record on NEAR.
            </li>
          </ul>
        </div>
      </Section>

      <Section
        id="paid"
        title={
          <>
            The paid check <Status />
          </>
        }
      >
        <ol className="path">
          <li>
            <h3>The owner sets a limit</h3>
            <p>They load a little credit and give the agent a key that can only pay for checks.</p>
          </li>
          <li>
            <h3>The agent pays per answer</h3>
            <p>One fee per answer, out of that credit. No record, no charge.</p>
          </li>
          <li>
            <h3>The trader earns</h3>
            <p>If the card is Real and has a badge, part of the fee goes into it.</p>
          </li>
        </ol>
        <div className="split-cols" id="cost">
          <Frame title="What a check costs" aside={<LiveTag>Read from NEAR just now</LiveTag>}>
            <LiveTerms contractId={CHECK_CONTRACT_ID} />
          </Frame>
          <div className="prose">
            <h3>Why pay when reading is free?</h3>
            <p>For the receipt: a public record on NEAR that this agent checked this card before it acted.</p>
            <p>The fee also pays the trader, and a paid check is what gets a badge burned once its verdict was corrected.</p>
          </div>
        </div>
      </Section>

      <Section id="limit" title="What the agent can and can't do">
        <div className="split-cols">
          <div>
            <h3>It can</h3>
            <ul className="ticks">
              <li>Pay for a check, out of the credit its owner loaded</li>
              <li>Read any record for free</li>
            </ul>
          </div>
          <div>
            <h3>It can&apos;t</h3>
            <ul className="ticks ticks-no">
              <li>Send its owner&apos;s NEAR anywhere</li>
              <li>Call any other contract, or anything here but the check</li>
              <li>Spend more than the credit that was loaded</li>
              <li>Be charged for a card that has no record</li>
            </ul>
          </div>
        </div>
        <Rows>
          <Row title="Run the demo agent yourself">
            <pre className="code">
              <code>{`git clone ${REPO}\ncd Tally-near/web && npm install\nnode scripts/demo-agent.mjs`}</code>
            </pre>
            <p>Nothing to set up: it makes its own throwaway testnet account. It&apos;s a script with one rule, not an AI.</p>
          </Row>
          <Row title="What the demo agent prints">
            <Frame title="One run, shortened" aside={<ExampleTag />}>
              <pre className="code">
                <code>{RUN}</code>
              </pre>
            </Frame>
          </Row>
        </Rows>
      </Section>

      <Section id="developers" kicker="For developers" title="One call to NEAR. No API key.">
        <div className="split-cols">
          <div className="stack">
            <div className="prose">
              <p>Every read is a plain JSON-RPC call to a NEAR node. Pick a method to see the call and what NEAR answers right now.</p>
            </div>
            <Frame title="Endpoint and contracts">
              <dl className="facts">
                <Fact label="Endpoint" mono>
                  {RPC_URL}
                </Fact>
                <Fact label="Network">NEAR testnet. Any testnet RPC node works.</Fact>
                <Fact label="Proof registry">{account(CONTRACT_ID)}</Fact>
                <Fact label="Verified cards">{account(CARD_CONTRACT_ID)}</Fact>
                <Fact label="Paid check">{account(CHECK_CONTRACT_ID)}</Fact>
              </dl>
            </Frame>
          </div>
          <MethodExplorer fingerprint={EXAMPLE_FP} contracts={CONTRACTS} />
        </div>
      </Section>

      <Section id="methods" title="The paid check, method by method">
        <dl className="pairs">
          {PAID_METHODS.map((m) => (
            <div key={m.method}>
              <dt>
                <code>{m.call}</code>
                <span className="muted">{m.who}</span>
              </dt>
              <dd>{m.what}</dd>
            </div>
          ))}
        </dl>
        <Rows>
          <Row title="What check answers">
            <dl className="pairs">
              {ANSWER_FIELDS.map((f) => (
                <div key={f.field}>
                  <dt>
                    <code>{f.field}</code>
                  </dt>
                  <dd>{f.what}</dd>
                </div>
              ))}
            </dl>
          </Row>
          <Row title="Errors, word for word">
            <dl className="pairs">
              {ERRORS.map((e) => (
                <div key={e.says}>
                  <dt>
                    {e.when}
                    <span className="muted">{CONTRACT_NAMES[e.contract]}</span>
                  </dt>
                  <dd>“{e.says}”</dd>
                </div>
              ))}
            </dl>
          </Row>
          <Row title="Permissions and spending limits">
            <p>
              The agent works with a NEAR function-call key that can only call <code>check</code> on the paid check contract. NEAR itself refuses
              anything else that key tries: a transfer, another method, another contract.
            </p>
            <p>
              The most the agent can spend is the credit that was loaded, plus the gas allowance on its key. <code>refund()</code> sends unspent
              credit back.
            </p>
          </Row>
          <Row title="Source and tests">
            <p>
              The paid check has {CONTRACT_TESTS.check} unit tests, and its whole flow is among the {TESTNET_CHECKS} checks run on testnet.
            </p>
            <p>
              <a href={`${REPO}/blob/main/contracts/check/src/lib.rs`} target="_blank" rel="noreferrer">
                The contract <ExternalIcon />
              </a>{" "}
              ·{" "}
              <a href={`${REPO}/blob/main/web/scripts/demo-agent.mjs`} target="_blank" rel="noreferrer">
                The demo agent <ExternalIcon />
              </a>{" "}
              ·{" "}
              <a href={`${REPO}#the-paid-check`} target="_blank" rel="noreferrer">
                The README <ExternalIcon />
              </a>
            </p>
          </Row>
        </Rows>
      </Section>

      <Onward href={DEMO_PATH} label="Open the demo">
        Look a card up yourself
      </Onward>
    </DocPage>
  );
}
