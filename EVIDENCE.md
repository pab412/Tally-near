# Evidence: check every claim on NEAR yourself

Nothing here asks you to trust Tally or this README. Each claim below is one free read of a contract on NEAR testnet: no account, no key, no wallet.

**Check them all with one command** (needs Node 20.9 or newer):

```
cd web
node scripts/evidence.mjs
```

It asks NEAR about each claim, prints a line for each, and ends with `14 of 14 match`. If NEAR answers anything else, it prints what NEAR said and exits with an error.

## The claims

<!-- claims:start -->
| # | Claim | Asked of NEAR | Expected answer |
|---|---|---|---|
| 1 | The registry holds at least three cards. | `proof.notpab.testnet cards` | 3 or more |
| 2 | Only Tally's attester can record a verdict, and it is notpab.testnet. | `proof.notpab.testnet attester` | "notpab.testnet" |
| 3 | Sample card A is Real, and its record has two entries. | `proof.notpab.testnet get {"fingerprint":"776b729a98a45576e4381c7732d4b0eafcbec4eecc114c79116d9a7002258dbe"}` | verdict Real, entries 2 |
| 4 | A corrected verdict is added on top and the old one stays: sample card A was recorded Fake, then Real. | `proof.notpab.testnet history {"fingerprint":"776b729a98a45576e4381c7732d4b0eafcbec4eecc114c79116d9a7002258dbe"}` | Fake, then Real |
| 5 | A record holds a verdict, Tally's id for the check and the time NEAR recorded it. No name, no handle. | `proof.notpab.testnet get {"fingerprint":"3171ca6c47b50b2218cc76275f573aa1670479e2ae2eada69c00f20236599e58"}` | fingerprint, latest (verdict, check_id, recorded_at_ms), entries |
| 6 | Sample card B is Real. | `proof.notpab.testnet get {"fingerprint":"3171ca6c47b50b2218cc76275f573aa1670479e2ae2eada69c00f20236599e58"}` | verdict Real |
| 7 | The demo's Fake card is recorded Fake. | `proof.notpab.testnet get {"fingerprint":"cab484af6173d22914dcb29a6b5911c0671c33fdd0ef84bfdac8fed23be332b8"}` | verdict Fake |
| 8 | A card Tally never checked has no record: sample card C. | `proof.notpab.testnet get {"fingerprint":"01a765b799bb38ca88b75b64ec739a4c68bc6d9ecb7a77335d94da005d0c68bf"}` | null |
| 9 | Sample card B has a verified card, held by notpab.testnet. | `card.notpab.testnet nft_token {"token_id":"3171ca6c47b50b2218cc76275f573aa1670479e2ae2eada69c00f20236599e58"}` | owner_id notpab.testnet |
| 10 | At least one verified card exists. | `card.notpab.testnet nft_total_supply` | "1" or more |
| 11 | A verified card's picture is drawn by this site. | `card.notpab.testnet nft_metadata` | base_uri https://tally-near.vercel.app |
| 12 | A paid check costs 0.01 NEAR, and half of it goes to the trader's verified card. | `check.notpab.testnet terms` | fee 10000000000000000000000 (0.01 NEAR), trader_percent 50 |
| 13 | The paid check reads the same registry and pays into the same verified cards. | `check.notpab.testnet terms` | registry proof.notpab.testnet, cards card.notpab.testnet |
| 14 | The example guard wallet asks the same registry before it pays, and pays the holders of the same verified cards. | `tally-guard.testnet terms` | registry proof.notpab.testnet, cards card.notpab.testnet |
<!-- claims:end -->

The table and the script read the same file, `web/scripts/evidence-claims.json`, so they can't drift apart (`web/tests/evidence.test.ts` checks it).

## Check one by hand

Any row can be asked with curl. This is row 3, sample card A:

```
curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"proof.notpab.testnet","method_name":"get","args_base64":"'$(printf '{"fingerprint":"776b729a98a45576e4381c7732d4b0eafcbec4eecc114c79116d9a7002258dbe"}' | base64 | tr -d '\n')'"}}' | python3 -c "import sys,json; print(bytes(json.load(sys.stdin)['result']['result']).decode())"
```

## What a fingerprint is, and what it isn't

A fingerprint is the SHA-256 of one exact picture file. The sample cards are in `web/public/samples`, and `sha256sum` of each gives the fingerprint in the table.

A re-saved, resized or cropped copy of a card is a different file with a different fingerprint, so NEAR has no record of it. No record is a block, never an allow (see `THREAT-MODEL.md`).

## What isn't a read

Refusals (a transfer of a verified card, a withdraw after a correction, an agent's key sending money) can't be shown by a read. They are run for real on testnet by `node scripts/e2e-contracts.mjs`, `node scripts/demo-agent.mjs` and `node scripts/demo-guard.mjs` (a wallet that won't pay a Fake card's trader), which print each transaction.
