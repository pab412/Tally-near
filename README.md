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
| Proof registry contract | `contracts/proof` | Written, 7 unit tests pass. Not deployed yet. |

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

## Built with

- [near-sdk-rs](https://github.com/near/near-sdk-rs)
- Written with Claude Code (AI-generated code, reviewed by the team).

## Licence

MIT
