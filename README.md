# Tally on NEAR

A permanent, public record of every PnL card Tally checks. Built for the NEAR Hackathon (November 2026).

**The problem.** In crypto, anyone can post a screenshot of a 100x. [Tally](https://tallypnl.com) checks those PnL cards for fakes. Until now, a verdict lived in Tally's own database, so you had to trust Tally not to change it.

**What NEAR adds.** Each check is written to a smart contract on NEAR: the card's fingerprint, the verdict and the time. Nobody can delete or rewrite a record, including Tally. A corrected verdict is added on top, and the earlier ones stay visible. Anyone, a person or an AI agent, can look a card up without asking Tally.

## What existed before, and what's new

- **Before the hackathon:** Tally itself (the website, the card reading, the checks). It runs on Vercel and reads Solana trades. None of that is in this repository or part of this entry.
- **Built for the hackathon (everything in this repository):** the NEAR contracts and the pages that use them.

## What's here so far

| Part | Where | State |
|---|---|---|
| Proof registry contract | `contracts/proof` | 7 unit tests pass. Live on testnet at [`proof.notpab.testnet`](https://testnet.nearblocks.io/address/proof.notpab.testnet) (attester: `notpab.testnet`). |

| Demo page | `web` | Look a card up on NEAR from your browser, or record a sample check. 17 tests pass. |

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

### Build and deploy (testnet)

Needs Rust (`rustup target add wasm32-unknown-unknown`), cargo-near and near-cli-rs.

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
- **Record a check** (demo only). Pick a verdict and press Record. A server route signs the `record` call with a limited key that can do nothing else.

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

### Run the tests

```
cd web
npm test
```

You should see `17 passed`.

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

3. Run `npm run dev`, open the **Record a check** tab, pick a sample card, choose a verdict, type your password and press **Record**.
4. You see the verdict bar say RECORDED with a link to the transaction. Switch to **Look up a card**: the same card now shows that verdict.

Safer than a full-access key: add a function-call key that can only call `record` on your contract, and use that one.

```
near account add-key <your-account>.testnet grant-function-call-access --allowance '0.25 NEAR' --contract-account-id proof.<your-account>.testnet --function-names record autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send
```

Without `RECORD_PASSWORD`, the account and the key all set, recording is switched off and the page says so. The server refuses any account that isn't on testnet.

## Built with

- [near-sdk-rs](https://github.com/near/near-sdk-rs), [near-api-js](https://github.com/near/near-api-js), [Next.js](https://nextjs.org)
- Written with Claude Code (AI-generated code, reviewed by the team).

## Licence

MIT
