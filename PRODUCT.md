# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served equally:
- **Traders** who saw a PnL card posted and want to know whether Tally checked it and what it found. They want the verdict fast.
- **NEAR hackathon judges** (November 2026) evaluating the entry. They need to see quickly what is on-chain, why it matters, and try it themselves with the SAMPLE cards.

## Product Purpose

Tally (tallypnl.com) checks crypto PnL cards for fakes. Tally on NEAR writes each check to a NEAR contract (`proof.notpab.testnet`) so a verdict can't be deleted or rewritten, including by Tally, and anyone can look a card up without asking Tally. The demo page lets a visitor drop in a card picture, fingerprints it in the browser, and shows the on-chain verdict.

## Positioning

The record is public and permanent: a corrected verdict is added on top, and earlier ones stay visible. The picture never leaves the visitor's device; only its SHA-256 fingerprint is used.

## Operating Context

- Lookup works for everyone, needs no wallet, and reads NEAR testnet directly from the browser.
- "Record a check" is a demo: the hosted copy is password-protected and signs with a record-only key held on the server. Judges can run their own copy against their own contract (README steps).
- Testnet only. Never mainnet.

## Capabilities and Constraints

- Verdicts: Real, Unclear, Fake. A record holds verdict, check id and the chain's time, never a name, handle, wallet or picture.
- Terms: fingerprint, record, verdict, check.
- Next.js app in `web/`, deployable to Vercel.

## Brand Commitments

- Tally's look: near-black background, pink #FF248B, clean type (binding, from the owner).
- Voice: plain and short, like the README. No crypto jargon; each term explained once.

## Evidence on Hand

- Live contract on testnet with one demo record (check id `demo1`).
- No real users, testimonials or real cards. All sample cards and data are labelled SAMPLE; no real people's names anywhere.

## Product Principles

1. The verdict comes first: one glance answers "did Tally check this, and what did it find?"
2. Show the proof, don't just claim it: every result links to the record on a NEAR explorer.
3. Nothing personal goes on-chain or leaves the device.
4. Demo data is always obviously demo data.
