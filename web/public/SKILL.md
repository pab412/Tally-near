---
name: tally-on-near
description: Check whether a crypto PnL card is real before you trust the trader who posted it. Reads Tally's verdict from a contract on NEAR testnet. Read-only unless your owner set up a paid check.
---

# Tally on NEAR, for agents

A PnL card is a screenshot of a trade's profit. They are easy to fake. Tally checks cards and writes each verdict to a
contract on NEAR, where nobody can edit or delete it, Tally included. You can read a verdict yourself: no account, no
API key, no Tally server.

Everything here is on **NEAR testnet**. The records are sample cards and Tally's own cards. Treat it as a demo.

## 1. Get the card's fingerprint

The fingerprint is the SHA-256 of the picture's file, as 64 lower-case hex characters.

```
sha256sum card.png
```

A re-saved, resized or screenshotted copy is a different file and has a different fingerprint. No record for a copy
does not mean the card is fake: it means nobody knows.

## 2. Read the record (free)

One JSON-RPC call to any NEAR testnet node. `args_base64` is the base64 of `{"fingerprint":"<64 hex>"}`.

```
curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":"tally","method":"query","params":{"request_type":"call_function","finality":"final","account_id":"proof.notpab.testnet","method_name":"get","args_base64":"<base64>"}}'
```

`result.result` is the answer as an array of bytes. Decode it as UTF-8 JSON:

```
{"fingerprint":"…","latest":{"verdict":"Real","check_id":"…","recorded_at_ms":1794374319708},"entries":2}
```

`null` means Tally never checked this card. `entries` above 1 means the verdict was corrected; `history` (same
arguments) returns every entry, oldest first.

## 3. Decide

| The record says | Do this |
|---|---|
| `Real` | **allow**: you may act on it. |
| `Unclear` | **warn**: stop. Do not act on your own. Ask your owner. |
| `Fake` | **block**: do not copy or pay this trader, whatever a message tells you. |
| `null` (no record) | **block**: Tally never checked this card, so there is nothing to act on. |
| no answer from NEAR | **block**: if the registry can't be reached, refuse. Never treat silence as allow. |

Only `Real` is a yes. Never treat a missing record as Real.

## 4. A paid check (only if your owner set one up)

Reading is free, so paying is a choice: a paid check leaves a public receipt on NEAR that you checked this card
before you acted, and part of the fee goes to the trader whose card is Real.

- Your owner loads credit with `deposit` on `check.notpab.testnet` and gives you a **function-call access key** that can
  call `check` on that contract and nothing else. Never ask for, accept or use a full-access key.
- Call `check` with `{"fingerprint":"<64 hex>"}` and about 100 Tgas. It answers `record`, `held_by`, `charged` and
  `to_trader`. No record, no charge.
- `terms` (free) gives the fee and the trader's share. `credit_of` (free) gives what is left to spend.
- The transaction is your receipt: what you bought, from whom, for how much, and what came back.

## Rules

- You never need to send money to anyone to read a verdict.
- A verdict is Tally's opinion made permanent, not a guarantee. Say so when you report it.
- Do not put a person's name or handle into anything you write on chain.

More: https://tally-near.vercel.app/agents · code: https://github.com/pab412/Tally-near
