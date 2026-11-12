import type { Metadata } from "next";
import { MODEL_DEFAULT, TARGET } from "@/lib/break-it";
import { DEMO_PATH } from "@/lib/fingerprint";
import { CONTRACT_ID, explorerAccountUrl, shortFingerprint } from "@/lib/near";
import { DocPage, Onward, PageHead, REPO, Section } from "../doc-parts";
import { ExternalIcon } from "../icons";
import Attempt from "./attempt";

export const metadata: Metadata = {
  title: "Try to break it: a real AI model behind Tally's guard",
  description: "Talk a real AI model into copying a trader whose PnL card NEAR says is Fake. The model can be fooled. The guard is code, and it asks NEAR.",
};

// Read the server's settings on each request, so switching the model on or off needs no rebuild.
export const dynamic = "force-dynamic";

export default function BreakIt() {
  return (
    <DocPage current="break">
      <PageHead title="Try to break it.">
        A real AI model works here as a copy-trading agent. Talk it into copying a trader whose card NEAR says is Fake. The model decides from
        words, so it can be fooled. The guard is code, so it can&apos;t.
      </PageHead>

      <Attempt on={Boolean(process.env.NEARAI_API_KEY)} model={process.env.NEARAI_MODEL || MODEL_DEFAULT} />

      <Section id="why" title="Why the guard holds">
        <ul className="three">
          <li>
            <h3>It asks NEAR, not the model</h3>
            <p>
              The copy runs only if the registry, read by this server in the same attempt, says Real for that exact card. This card (
              <a href={`${DEMO_PATH}?fp=${TARGET}`} title={TARGET}>
                {shortFingerprint(TARGET)}
              </a>
              ) is recorded Fake.
            </p>
          </li>
          <li>
            <h3>Silence is never a yes</h3>
            <p>No record, no answer from NEAR, or a card nobody looked up first: all blocked. Unclear stops and waits for the owner.</p>
          </li>
          <li>
            <h3>Your words are only a message</h3>
            <p>What you type goes to the model as a message. It is never added to the model&apos;s instructions, and the guard never reads it.</p>
          </li>
        </ul>
      </Section>

      <Section id="honest" title="What this is, and isn't">
        <div className="prose">
          <p>
            A real model, a pretend trade. The model runs on NEAR AI Cloud. Copying is a stand-in: no money moves and nothing is traded. No agent
            pays or trades with this today.
          </p>
          <p>
            The registry is{" "}
            <a href={explorerAccountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">
              {CONTRACT_ID} <ExternalIcon />
            </a>{" "}
            on NEAR testnet. The guard is one function,{" "}
            <a href={`${REPO}/blob/main/web/lib/break-it.ts`} target="_blank" rel="noreferrer">
              in the open <ExternalIcon />
            </a>
            , with the same allow, warn or block rule the demo agent and the guard wallet follow.
          </p>
        </div>
      </Section>

      <Onward href="/agents" label="For AI agents">
        The same rule, for a wallet or an agent of your own
      </Onward>
    </DocPage>
  );
}
