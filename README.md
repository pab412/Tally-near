# Tally on NEAR

A permanent, public record of every PnL card Tally checks, and a verified card that only exists while that record says the card is real. Built for the NEAR Hackathon (November 2026).

**The problem.** In crypto, anyone can post a screenshot of a 100x. [Tally](https://tallypnl.com) checks those PnL cards for fakes. Until now, a verdict lived in Tally's own database, so you had to trust Tally not to change it.

**What NEAR adds.** Each check is written to a smart contract on NEAR: the card's fingerprint, the verdict and the time. Nobody can delete or rewrite a record, including Tally. A corrected verdict is added on top, and the earlier ones stay visible. Anyone, a person or an AI agent, can look a card up without asking Tally.

A card Tally found real can also become a **verified card**: an NFT the trader holds. It can't be sold or moved, the contract only mints it after asking the registry itself, and it is burned if the verdict is ever corrected.

## What existed before, and what's new

- **Before the hackathon:** Tally itself (the website, the card reading, the checks). It runs on Vercel and reads Solana trades. None of that is in this repository or part of this entry.
- **Built for the hackathon (everything in this repository):** the NEAR contracts and the pages that use them.

## What's here so far

| Part | Where | State |
|---|---|---|
| Proof registry contract | `contracts/proof` | 7 unit tests pass. Live on testnet at [`proof.notpab.testnet`](https://testnet.nearblocks.io/address/proof.notpab.testnet) (attester: `notpab.testnet`). |
| Verified card contract (NFT) | `contracts/card` | 18 unit tests pass, and the whole flow passes on testnet (`web/scripts/e2e-contracts.mjs`). |
| Shared types | `contracts/types` | What both contracts agree on: a fingerprint, the verdicts, a record. 2 unit tests pass. |
| Demo page | `web` | Look a card up on NEAR from your browser, record a sample check, mint or recheck a verified card. 26 tests pass. Live at [tally-near.vercel.app](https://tally-near.vercel.app). |

More parts are planned and will be listed here as they're built.

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

What is stored: the fingerprint, the NEAR account the trader chose to hold it, and the id of the check it came from. Never a name, a handle from another site or the picture.

### Run the tests

```
cd contracts/card
cargo test
```

You should see `18 passed`. `contracts/types` has 2 more (`cd contracts/types && cargo test`).

Unit tests can't make one contract call another, so the whole flow is also tested on testnet. `web/scripts/e2e-contracts.mjs` deploys both contracts under a testnet account you give it, then checks 19 things for real: a Real card mints after the registry is asked, a Fake or unchecked one is refused, nobody can fake the registry's answer, a transfer is refused, and a corrected verdict burns the card. It needs both `.wasm` files built (below) and a testnet account with about 5 NEAR:

```
cd web
node scripts/e2e-contracts.mjs <account.json> ../contracts/proof/target/near/tally_proof.wasm ../contracts/card/target/near/tally_card.wasm
```

`<account.json>` is `{"id":"<you>.testnet","pub":"ed25519:...","key":"ed25519:..."}` for a throwaway testnet account. Never use a real key.

### Build and deploy (testnet)

Needs Rust (`rustup target add wasm32-unknown-unknown`), cargo-near and near-cli-rs. Build with `cargo near`, not plain `cargo build`: near-sdk only uses NEAR's real host functions when cargo-near builds it.

```
cd contracts/proof
cargo near build non-reproducible-wasm --no-abi
near contract deploy proof.notpab.testnet use-file target/near/tally_proof.wasm with-init-call new json-args '{"attester":"notpab.testnet"}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
```

On Windows:
- Set the user environment variable `AWS_LC_SYS_PREBUILT_NASM=1`, or the tests fail to compile ("NASM command not found").
- Keep `--no-abi`, because cargo-near's ABI step doesn't link on Windows.
- If you installed cargo-near with npm, copy `cargo-near.exe` from npm's `node_modules\cargo-near\node_modules\.bin_real` into `%USERPROFILE%\.cargo\bin` so that `cargo near` finds it.

## The demo page

`web` (Next.js). It looks like [tallypnl.com](https://tallypnl.com) because it is meant to be part of it.

- **Look up a card.** Drop a PnL card picture on the page. Its fingerprint is computed in your browser (the picture is never uploaded), and the page asks the NEAR contract for that fingerprint. You see **Real**, **Unclear** or **Fake** with the date NEAR recorded it, the full history if a verdict was corrected, and a link to the explorer. A card with no record says "Tally hasn't checked this card yet."
- **Open a record from a link.** `/?fp=<fingerprint>` opens that card's record straight away, with no picture needed. The address bar becomes that link whenever you look a card up, and **Copy the link to this record** copies it. This is what a QR code on a Tally card points to: scan it and you see what NEAR holds for that card.
- **Record a check** (demo only). Pick a verdict and press Record. A server route signs the `record` call with a limited key that can do nothing else.
- **Verified card.** Shows whether the card has a verified card and who holds it. With the demo password you can mint one or ask for a recheck, and watch the contract decide: it refuses a card that isn't Real ("The contract refused", in the contract's own words), and it burns a card whose verdict was corrected.

Every card on the page is made up and marked SAMPLE.

### Run it

```
cd web
npm install
npm run dev
```

1. Open http://localhost:3000.
2. Click **Sample A**. You see its fingerprint on the left and the answer from NEAR on the right.
3. Click the explorer link to see the contract on NEAR testnet.
4. Open http://localhost:3000/?fp=cab484af6173d22914dcb29a6b5911c0671c33fdd0ef84bfdac8fed23be332b8. That fingerprint has a record on testnet, so the page shows **FAKE**, read live from the contract.

### Run the tests

```
cd web
npm test
```

You should see `26 passed`.

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
4. You see the verdict bar say RECORDED with a link to the transaction. Switch to **Look up a card**: the same card now shows that verdict.

Safer than a full-access key: add a function-call key that can only call `record` on your contract, and use that one.

```
near account add-key <your-account>.testnet grant-function-call-access --allowance '0.25 NEAR' --contract-account-id proof.<your-account>.testnet --function-names record autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send
```

The same for the card contract, with `--contract-account-id card.<your-account>.testnet --function-names mint,recheck`.

Without `RECORD_PASSWORD`, the account and the key all set, recording is switched off and the page says so. Without `NEAR_CARD_KEY`, minting is. The server refuses any account that isn't on testnet.

## Built with

- [near-sdk-rs](https://github.com/near/near-sdk-rs), [near-api-js](https://github.com/near/near-api-js), [Next.js](https://nextjs.org)
- Written with Claude Code (AI-generated code, reviewed by the team).

## Licence

MIT
