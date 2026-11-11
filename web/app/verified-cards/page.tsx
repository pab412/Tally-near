import type { Metadata } from "next";
import { REFUSALS } from "@/lib/card-rules";
import { DEMO_PATH } from "@/lib/fingerprint";
import { CARD_CONTRACT_ID, explorerAccountUrl } from "@/lib/near";
import { CONTRACT_TESTS } from "@/lib/repo-facts";
import Image from "next/image";
import Link from "next/link";
import { DocPage, Onward, PageHead, REPO, Row, Rows, Section } from "../doc-parts";
import { ExternalIcon } from "../icons";
import { ExampleTag, Frame, Status } from "../parts";

export const metadata: Metadata = {
  title: "Verified cards",
  description: "A verified card is an NFT for a PnL card Tally found real. It can't be sold, the contract only mints it for a real card, and it burns if the verdict changes.",
};

export default function VerifiedCards() {
  return (
    <DocPage current="cards">
      <PageHead title="A badge only a real card can hold.">
        A verified card is an NFT on NEAR that the trader holds. Its rules are built into the contract, so nobody has to take Tally&apos;s word.
      </PageHead>

      <Section id="what" title="What is a verified card?">
        <div className="split-cols">
          <div>
            <div className="prose">
              <p>A badge for a PnL card Tally found real.</p>
              <p>It can only exist for a card the record on NEAR says is Real, and anyone can have it rechecked.</p>
            </div>
            <h3>What it stores</h3>
            <ul className="ticks">
              <li>The card&apos;s fingerprint</li>
              <li>The NEAR account the trader chose to hold it</li>
              <li>The check it came from</li>
              <li>The money it holds</li>
            </ul>
          </div>
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
      </Section>

      <Section id="rules" title="Three rules, enforced by the contract">
        <ul className="trio">
          <li>
            <h3>Earned, never bought</h3>
            <p>It&apos;s only minted for a real card. The contract asks the record on NEAR itself.</p>
          </li>
          <li>
            <h3>Bound to the trader</h3>
            <p>It can&apos;t be sold or moved, so it can&apos;t be bought.</p>
          </li>
          <li>
            <h3>Removed if the verdict changes</h3>
            <p>Anyone can ask for a recheck. If the record no longer says Real, it burns.</p>
          </li>
        </ul>
      </Section>

      <Section id="path" title="How a card gets one">
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
      </Section>

      <Section
        id="money"
        title={
          <>
            A badge that holds money <Status />
          </>
        }
      >
        <div className="split-cols">
          <div className="prose">
            <p>When an AI agent pays to check a card, part of the fee goes into the card&apos;s badge. A faker has no badge and earns nothing.</p>
            <p>No outside agent pays yet, so this is a working mechanism, not income to count on. Looking a card up stays free for everyone.</p>
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
      </Section>

      {/* the contract's own answers and methods: there for whoever wants them, closed until opened */}
      <Section id="technical" title="Technical restrictions">
        <Rows>
          <Row title="What the contract refuses, word for word">
            <dl className="pairs">
              {REFUSALS.map((r) => (
                <div key={r.says}>
                  <dt>{r.when}</dt>
                  <dd>“{r.says}”</dd>
                </div>
              ))}
            </dl>
          </Row>
          <Row title="Mint, recheck and burn">
            <p>
              <code>mint</code> can only be called by Tally&apos;s account, and the contract asks the registry before it mints. One card, one badge.
            </p>
            <p>
              <code>recheck</code> can be called by anyone. If the registry&apos;s latest verdict is no longer Real, the badge is burned on the spot.
            </p>
            <p>
              <code>burn</code> lets the holder give their own badge up, once they have taken out what it holds.
            </p>
          </Row>
          <Row title="How it holds money">
            <p>
              <code>earn</code> pays a badge. Anyone can call it, and the paid check sends each trader&apos;s share through it.
            </p>
            <p>
              <code>withdraw</code> pays the holder, and the contract asks the registry first. It pays only while the verdict is still Real.
            </p>
            <p>
              <code>forfeited</code> shows what burned badges held. That money stays locked: no function of the contract can move it.
            </p>
          </Row>
          <Row title="NFT standards and views">
            <p>
              A standard NEAR NFT (NEP-171) with metadata (NEP-177) and enumeration (NEP-181), so wallets and explorers can show it. The token&apos;s
              id is the card&apos;s fingerprint.
            </p>
            <p>
              Free reads: <code>nft_token</code>, <code>nft_tokens</code>, <code>nft_tokens_for_owner</code>, <code>nft_supply_for_owner</code>,{" "}
              <code>nft_total_supply</code> and <code>nft_metadata</code>. Both transfer methods always refuse.
            </p>
            <p>
              The contract has {CONTRACT_TESTS.card} unit tests.{" "}
              <a href={explorerAccountUrl(CARD_CONTRACT_ID)} target="_blank" rel="noreferrer">
                {CARD_CONTRACT_ID} <ExternalIcon />
              </a>{" "}
              ·{" "}
              <a href={`${REPO}/blob/main/contracts/card/src/lib.rs`} target="_blank" rel="noreferrer">
                Its source on GitHub <ExternalIcon />
              </a>
            </p>
          </Row>
          <Row title="The picture">
            <p>
              Each token links to its picture at <code>/badge/</code> followed by the fingerprint. This site draws it, and only while the contract
              still holds the badge and the registry still says Real.
            </p>
            <p>The picture is drawn off-chain. The record on NEAR is what counts.</p>
          </Row>
        </Rows>
      </Section>

      <Onward href={DEMO_PATH} label="Open the demo">
        See one minted, refused and burned
      </Onward>
    </DocPage>
  );
}
