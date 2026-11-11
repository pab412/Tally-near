# Tally on NEAR

A permanent, public record of every PnL card Tally checks, a verified card that only exists while that record says the card is real, and a paid check that lets an AI agent ask before it trusts a trader, on a spending limit its owner set. Built for the NEAR Hackathon (November 2026).

**The problem.** In crypto, anyone can post a screenshot of a 100x. [Tally](https://tallypnl.com) checks those PnL cards for fakes. Until now, a verdict lived in Tally's own database, so you had to trust Tally not to change it.

**What NEAR adds.** Each check is written to a smart contract on NEAR: the card's fingerprint, the verdict and the time. Nobody can delete or rewrite a record, including Tally. A corrected verdict is added on top, and the earlier ones stay visible. Anyone, a person or an AI agent, can look a card up without asking Tally.

A card Tally found real can also become a **verified card**: an NFT the trader holds. It can't be sold or moved, the contract only mints it after asking the registry itself, and it is burned if the verdict is ever corrected.

An AI agent can pay for a check with the **paid check** contract. Its owner loads a little credit and gives the agent a key that can only pay for checks, so that credit is all it can ever spend. Part of each fee goes into the trader's verified card: the NFT itself holds the money, pays it out only while the card is still Real, and loses it if it is burned.

## Check it yourself in 60 seconds

Everything below is live on NEAR testnet. The first two need nothing installed.

**1. Read a record straight from NEAR.** No account, no key and no Tally server in between:

```
curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":"tally","method":"query","params":{"request_type":"call_function","finality":"final","account_id":"proof.notpab.testnet","method_name":"get","args_base64":"eyJmaW5nZXJwcmludCI6Ijc3NmI3MjlhOThhNDU1NzZlNDM4MWM3NzMyZDRiMGVhZmNiZWM0ZWVjYzExNGM3OTExNmQ5YTcwMDIyNThkYmUifQ=="}}' | python3 -c "import sys,json; print(bytes(json.load(sys.stdin)['result']['result']).decode())"
```

You should see sample card A's record: `"verdict":"Real"`, `"check_id":"sample-a-appeal"`, `"entries":2`. Two entries because it was first recorded Fake and then corrected; the first verdict is still there.

**2. See it in the browser.** Open https://tally-near.vercel.app/demo.
- Click **Sample A**: you see **Real**, and a history with the earlier **Fake** still in it.
- Click **Sample B**, then the **Verified card** tab: you see **Held**, the picture wallets show for the NFT, and what the card holds from paid checks.
- Click **Sample C**: you see **No record**.

**3. Run the demo agent.** It pays for two checks with a key that can do nothing else:

```
git clone https://github.com/pab412/Tally-near
cd Tally-near/web
npm install
node scripts/demo-agent.mjs
```

You should see `DON'T COPY` for the card recorded Fake, `COPY` for sample card B with part of the fee going into its verified card, and NEAR refusing when the agent tries to send its owner's money away.

## What existed before, and what's new

- **Before the hackathon:** Tally itself (the website, the card reading, the checks). It runs on Vercel and reads Solana trades. None of that is in this repository or part of this entry.
- **Built for the hackathon (everything in this repository):** the NEAR contracts and the pages that use them.

## What's here so far

| Part | Where | State |
|---|---|---|
| Proof registry contract | `contracts/proof` | 7 unit tests pass. Live on testnet at [`proof.notpab.testnet`](https://testnet.nearblocks.io/address/proof.notpab.testnet) (attester: `notpab.testnet`). |
| Verified card contract (NFT) | `contracts/card` | 30 unit tests pass, and the whole flow passes on testnet (`web/scripts/e2e-contracts.mjs`). Each token links to its picture and can hold money. Live on testnet at `card.notpab.testnet`. |
| Paid check contract | `contracts/check` | 21 unit tests pass, and the whole flow passes on testnet in the same run, with an agent whose key can only pay for checks. Live on testnet at `check.notpab.testnet`. |
| Demo agent | `web/scripts/demo-agent.mjs` | One command. It makes a throwaway testnet account, loads credit, pays for two checks with a limited key and decides whether to copy each trader. |
| Shared types | `contracts/types` | What the contracts agree on: a fingerprint, the verdicts, a record, and how the paid check talks to the card contract. 3 unit tests pass. |
| Demo page | `web` | Look a card up on NEAR from your browser, record a sample check, mint or recheck a verified card, and see its picture drawn at `/badge/<fingerprint>.png`. 46 tests pass. Live at [tally-near.vercel.app](https://tally-near.vercel.app). |

On the site each part is labelled "Live on testnet": all three contracts answer at their `notpab.testnet` addresses.

## The proof registry

`contracts/proof` (Rust, near-sdk 5):

- `record(fingerprint, verdict, check_id)`: Tally's attester account records a check. The time comes from the chain.
- `get(fingerprint)`: a card's current verdict, or nothing if it was never checked.
- `history(fingerprint)`: every entry for a card, oldest first.
- `cards()`: how many different cards have a record.

A fingerprint is the SHA-256 hash of the card image. The contract refuses anything that isn't a 64-character hash or a short plain check id, so a name, a handle or a link can't be put on-chain.

### Run the tests

```
cd contracts/proof
cargo test
```

You should see `7 passed`.

## The verified card

`contracts/card` (Rust, near-sdk 5, NEP-171 with NEP-177 metadata and NEP-181 enumeration). A verified card is an NFT whose id is the card's fingerprint. It does three things an ordinary NFT doesn't:

- **It can only be minted for a card the registry says is Real.** `mint(fingerprint, owner)` is attester-only, and before anything is minted the contract calls the registry's `get(fingerprint)` itself (a cross-contract call). A Fake, Unclear or never-checked card is refused. Tally's word alone isn't enough.
- **It can't be transferred or sold.** `nft_transfer` and `nft_transfer_call` always refuse, so a verified card can't be bought.
- **It answers to the registry for as long as it exists.** Anyone can call `recheck(fingerprint)`. The contract asks the registry again, and if the latest verdict is no longer Real, the card is burned on the spot.

Also:

- `burn(token_id)`: the holder can give their own card up (needs 1 yoctoNEAR, so only a full-access key can do it). Nobody else can burn it, Tally included.
- `nft_token`, `nft_tokens`, `nft_tokens_for_owner`, `nft_supply_for_owner`, `nft_total_supply`, `nft_metadata`: the standard views, so wallets and explorers can show it.
- Mints and burns log the standard NEP-171 events.
- **It has a picture: the card itself with a "Verified on NEAR" stamp.** Every token's `media` is `badge/<fingerprint>.png`, and `nft_metadata` gives the site's address as `base_uri` (the `pictures` argument of `new`), so a wallet or explorer joins the two. The site draws the picture on request (`web/app/badge/[file]/route.tsx`) and only while the card contract still holds the card and the registry's latest verdict is still Real. For any other card the link answers 404, so a corrected card stops showing "Verified" even before anyone asks for the burn.

- **It holds money.** Anyone can pay a verified card with `earn(fingerprint)`; the paid check sends a share of each fee there. The money belongs to the card, not to an account. `withdraw(token_id)` is holder-only, and the contract asks the registry first: it pays out only while the latest verdict is still Real, and burns the card instead if it isn't. A card that is burned because its verdict was corrected loses what it held, and that money stays locked in the contract: no function can move it, so Tally gains nothing by burning a card (`forfeited()` shows the total). A holder can't give up a card that still holds money by accident: `burn` refuses until it is withdrawn. What a card holds is in its token's `extra`, as `holds` (yoctoNEAR).

The site keeps no picture a visitor picks. Today it has pictures only of its own sample cards (`web/public/samples`, found by fingerprint); for any other card the badge shows the fingerprint in the card's place. Pictures of real Tally cards will come from Tally itself once Tally sends its checks to NEAR, which is not built yet.

What is stored: the fingerprint, the NEAR account the trader chose to hold it, and the id of the check it came from. Never a name, a handle from another site or the picture. The picture link carries nothing but the fingerprint.

### Run the tests

```
cd contracts/card
cargo test
```

You should see `30 passed`. `contracts/check` has 21 and `contracts/types` has 3 (`cargo test` in each folder).

Unit tests can't make one contract call another, so the whole flow is also tested on testnet. `web/scripts/e2e-contracts.mjs` deploys the three contracts under a testnet account you give it, then checks 43 things for real. For the card: a Real card mints after the registry is asked and links to its picture, a Fake or unchecked one is refused, nobody can fake the registry's answer, a transfer is refused, and a corrected verdict burns the card. For the paid check: an agent with no credit gets no answer, a check of a Real card costs one fee and half of it lands inside the verified card, a card with no record costs nothing, the agent's key can't send NEAR or call anything else, the holder withdraws, and after a correction the next paid check has the card burned with what it held. It needs the three `.wasm` files built (below) and a testnet account with about 8 NEAR:

```
cd web
node scripts/e2e-contracts.mjs <account.json> ../contracts/proof/target/near/tally_proof.wasm ../contracts/card/target/near/tally_card.wasm ../contracts/check/target/near/tally_check.wasm
```

`<account.json>` is `{"id":"<you>.testnet","pub":"ed25519:...","key":"ed25519:..."}` for a throwaway testnet account. Never use a real key.

### Build and deploy (testnet)

Needs Rust (`rustup target add wasm32-unknown-unknown`), cargo-near and near-cli-rs. Build with `cargo near`, not plain `cargo build`: near-sdk only uses NEAR's real host functions when cargo-near builds it.

```
cd contracts/proof
cargo near build non-reproducible-wasm --no-abi
near contract deploy proof.notpab.testnet use-file target/near/tally_proof.wasm with-init-call new json-args '{"attester":"notpab.testnet"}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
```

The card contract and the paid check are built the same way, each in its own folder:

```
cd contracts/card
cargo test
cargo near build non-reproducible-wasm --no-abi
cd ../check
cargo test
cargo near build non-reproducible-wasm --no-abi
```

Each one gets its own account, paid for by `notpab.testnet`. The card contract needs about 2.5 NEAR for storage, and the paid check about 2 NEAR:

```
near account create-account fund-myself card.notpab.testnet '2.7 NEAR' autogenerate-new-keypair save-to-legacy-keychain sign-as notpab.testnet network-config testnet sign-with-legacy-keychain send
near account create-account fund-myself check.notpab.testnet '2 NEAR' autogenerate-new-keypair save-to-legacy-keychain sign-as notpab.testnet network-config testnet sign-with-legacy-keychain send
```

The card contract's `new` takes three things: who may mint, which registry to ask, and where pictures are served from (an `https://` address with no slash at the end):

```
cd contracts/card
near contract deploy card.notpab.testnet use-file target/near/tally_card.wasm with-init-call new json-args '{"attester":"notpab.testnet","registry":"proof.notpab.testnet","pictures":"https://tally-near.vercel.app"}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
```

The paid check's `new` takes who collects the contract's share, the registry, the card contract, the fee in yoctoNEAR (here 0.01 NEAR) and the trader's share in percent:

```
cd contracts/check
near contract deploy check.notpab.testnet use-file target/near/tally_check.wasm with-init-call new json-args '{"owner":"notpab.testnet","registry":"proof.notpab.testnet","cards":"card.notpab.testnet","fee":"10000000000000000000000","trader_percent":50}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
```

The site signs with two function-call keys on `notpab.testnet`, each with a 0.25 NEAR allowance: one that can only call `record` on the registry, and one that can only call `mint` and `recheck` on the card contract. The key the site used before is then deleted:

```
near account add-key notpab.testnet grant-function-call-access --allowance '0.25 NEAR' --contract-account-id proof.notpab.testnet --function-names 'record' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send
near account add-key notpab.testnet grant-function-call-access --allowance '0.25 NEAR' --contract-account-id card.notpab.testnet --function-names 'mint, recheck' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send
near account delete-keys notpab.testnet public-keys ed25519:Er3ygqWK5WkCC7bCoHqQKh6kTk9ce3uuC3JUcYkjKCtM network-config testnet sign-with-legacy-keychain send
```

To check both are live:

```
near contract call-function as-read-only check.notpab.testnet terms json-args '{}' network-config testnet now
near contract call-function as-read-only card.notpab.testnet nft_metadata json-args '{}' network-config testnet now
```

On Windows:
- Set the user environment variable `AWS_LC_SYS_PREBUILT_NASM=1`, or the tests fail to compile ("NASM command not found").
- Keep `--no-abi`, because cargo-near's ABI step doesn't link on Windows.
- If you installed cargo-near with npm, copy `cargo-near.exe` from npm's `node_modules\cargo-near\node_modules\.bin_real` into `%USERPROFILE%\.cargo\bin` so that `cargo near` finds it.

## The paid check

`contracts/check` (Rust, near-sdk 5). An AI agent that follows calls or copies trades asks it whether a card is real, and pays a small fee for the answer.

- **The agent has a spending limit.** Its owner calls `deposit(account_id)` with some NEAR attached: that is the agent's credit. The agent works with a NEAR function-call key that can only call `check` on this contract. NEAR itself refuses anything else that key tries (a transfer, another method, another contract), and the contract refuses a check once the credit is used up. So the most the agent can ever spend is the credit that was loaded, plus the gas allowance on its key. `refund()` sends unspent credit back to the account.
- **`check(fingerprint)`** asks the proof registry and the card contract on-chain, in the same call, and answers with the card's record exactly as the registry gives it, who holds its verified card, what was charged and what went to the trader.
- **No answer, no charge.** The fee is taken only when there is a record to give. A card Tally has never checked costs nothing, and neither does a check the registry couldn't answer.
- **The trader earns.** When the card is Real and has a verified card, `trader_percent` of the fee is paid into that verified card (`earn` on the card contract). The rest is the contract's own share, which only its owner can `collect()`; credit that accounts loaded is never part of it.
- **A corrected card is caught.** When a card still has a verified card but the registry no longer says Real, the paid check calls `recheck` on the card contract, which burns the card with whatever it held.
- Each charged check logs an event (`tally_check`, `checked`) with the agent, the fingerprint, the verdict and the amounts.
- Views: `terms()` (the fee, the trader's share, the two contracts it asks, how many checks it has answered), `credit_of(account_id)`, `takings()`.

Reading a record straight from the registry is free and stays free. An agent pays when it wants the receipt: the `checked` event is a public record on NEAR that this agent looked this card up before it acted, which its owner can audit. The fee also pays the trader, and a paid check is what gets a corrected card burned without anyone having to notice it.

What is stored: each account's credit and the contract's own share. Never a name or a handle.

### Run the demo agent

```
cd web
npm install
node scripts/demo-agent.mjs
```

It runs against `check.notpab.testnet` (`CHECK_CONTRACT=<account>` points it at another deployment). It makes its own throwaway testnet account with NEAR's testnet faucet (or uses yours: `AGENT_ACCOUNT=<account.json>`), then prints each step:

1. The owner loads credit for two checks.
2. The agent gets a key that can only call `check`.
3. The agent pays for a check of each card and decides: copy the trader only if NEAR says the card is Real. Each line links to the transaction.
4. The agent tries to send the owner's NEAR to another account, and NEAR refuses.
5. What the Real card's verified card now holds.
6. The owner removes the agent's key and takes back unspent credit.

It is a script with one rule (`web/scripts/agent-rule.mjs`), not an AI. What it demonstrates is the money side: the limit, the limited key, the fee and the trader's share.

## The demo page

`web` (Next.js). It looks like [tallypnl.com](https://tallypnl.com) because it is meant to be part of it.

- **The front page** (`/`): what this is in one screen, and the way on to each part.
- **How it works** (`/how-it-works`): three steps beside the real parts they describe: a card and its fingerprint, a card's history, and a record read live from NEAR. Then what goes on NEAR and what never does.
- **Verified cards** (`/verified-cards`): the NFT's three rules, its picture, how it holds money, how a card gets one, and what the contract answers, word for word, when someone tries something it doesn't allow.
- **For AI agents** (`/agents`): the call that reads a record (free, live, and printed by the same code the site uses), with NEAR's answer read as the page opens. Then the paid check: how it works, what it costs (read live from the contract once it is deployed), how to run the demo agent, and what the agent's key can and can't do.
- **Questions** (`/faq`): short answers.

The demo itself is at `/demo`, with three tabs:

- **Look up a card.** Drop a PnL card picture on the page. Its fingerprint is computed in your browser (the picture is never uploaded), and the page asks the NEAR contract for that fingerprint. You see **Real**, **Unclear** or **Fake** with the date NEAR recorded it, the full history if a verdict was corrected, and a link to the explorer. A card with no record says "Tally hasn't checked this card yet."
- **Open a record from a link.** `/demo?fp=<fingerprint>` opens that card's record straight away, with no picture needed. The address bar becomes that link whenever you look a card up, and **Copy the link to this record** copies it. This is what a QR code on a Tally card points to: scan it and you see what NEAR holds for that card.
- **Record a check** (demo only). Pick a verdict and press Record. A server route signs the `record` call with a limited key that can do nothing else.
- **Verified card.** Shows whether the card has a verified card, who holds it, what it holds, and the picture wallets show for it. With the demo password you can mint one or ask for a recheck, and watch the contract decide: it refuses a card that isn't Real ("The contract refused", in the contract's own words), and it burns a card whose verdict was corrected.

Every card on the page is made up and marked SAMPLE.

### Run it

```
cd web
npm install
npm run dev
```

1. Open http://localhost:3000. You see the front page. Its **How it works** page shows a real record read live from NEAR, in step 3. Click **Try the demo**.
2. Click **Sample A**. You see its fingerprint on the left and the answer from NEAR on the right.
3. Click the explorer link to see the contract on NEAR testnet.
4. Open http://localhost:3000/demo?fp=cab484af6173d22914dcb29a6b5911c0671c33fdd0ef84bfdac8fed23be332b8. That fingerprint has a record on testnet, so the page shows **Fake**, read live from the contract.

### Run the tests

```
cd web
npm test
```

You should see `46 passed`.

### Try recording yourself

The hosted demo asks for a password before it records, so strangers can't fill the registry. To try recording, run your own copy against your own contract:

1. Create a NEAR testnet account and deploy the contract to a sub-account of it (see "Build and deploy" above), with your account as the attester.
2. In `web`, create a file named `.env.local` (it is ignored by git) with:

```
NEXT_PUBLIC_CONTRACT_ID=proof.<your-account>.testnet
NEAR_ATTESTER_ACCOUNT=<your-account>.testnet
NEAR_ATTESTER_KEY=ed25519:<a key of that account>
RECORD_PASSWORD=<any password you choose>
```

For the **Verified card** tab, deploy `contracts/card` too and add:

```
NEXT_PUBLIC_CARD_CONTRACT_ID=card.<your-account>.testnet
NEAR_CARD_KEY=ed25519:<a key of that account that can call mint and recheck on the card contract>
```

3. Run `npm run dev`, open the **Record a check** tab, pick a sample card, choose a verdict, type your password and press **Record**.
4. The record appears with its verdict and a link to the transaction. Switch to **Look up a card**: the same card now shows that verdict.

Safer than a full-access key: add a function-call key that can only call `record` on your contract, and use that one.

```
near account add-key <your-account>.testnet grant-function-call-access --allowance '0.25 NEAR' --contract-account-id proof.<your-account>.testnet --function-names record autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send
```

The same for the card contract, with `--contract-account-id card.<your-account>.testnet --function-names mint,recheck`.

Without `RECORD_PASSWORD`, the account and the key all set, recording is switched off and the page says so. Without `NEAR_CARD_KEY`, minting is. The server refuses any account that isn't on testnet.

## What you still have to trust

- **The verdict is Tally's.** NEAR makes a verdict permanent and public. It doesn't make it right. A wrong one is corrected by adding to the record, never by changing it.
- **The contract accounts still have their deploy keys.** "Nobody can change it" is true of the rules as written. On testnet, whoever holds a contract account's full-access key could still replace its code. Deleting those keys makes the rules permanent, and anyone can check that an account has none; that is the step before mainnet.
- **Only unclaimed money is lost with a burned card.** A holder can withdraw whenever the registry says Real, so a card that is corrected later loses what it holds at that moment, not what was already taken out.
- **The paid check is a choice.** Records are public, so an agent can read them for free. It pays for the receipt and to reward the trader.
- **The picture is drawn off-chain**, by this site. The token's link carries only the fingerprint, and the record on NEAR is what counts.

## Built with

- [near-sdk-rs](https://github.com/near/near-sdk-rs), [near-api-js](https://github.com/near/near-api-js), [Next.js](https://nextjs.org)
- Written with Claude Code (AI-generated code, reviewed by the team).
- The panther picture on the front page is Tally's own mascot, drawn for this page with an AI image tool (Higgsfield) from Tally's existing art. The card on its phone is a real Tally card, drawn by Tally's own card code with made-up figures (its coin is `$SAMPLE`). The same card is the example badge on the Verified cards page.
- The badge picture is set in [Geist](https://vercel.com/font) (SIL Open Font License), in `web/assets/fonts`.

## Licence

MIT
