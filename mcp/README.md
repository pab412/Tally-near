# Tally's MCP server

Lets Claude Code, Codex or any agent that speaks MCP ask Tally's registry on NEAR: is this PnL card real?

Three tools, all free reads. No account, no key, nothing is paid and nothing is written.

| Tool | What it answers |
|---|---|
| `check_card(fingerprint)` | allow, warn or block, with the reasons from the card's record. Real is allow. Unclear is warn: stop and ask your owner. Fake, no record, or a registry that doesn't answer is block. |
| `card_history(fingerprint)` | Every verdict the card has had, oldest first. A correction is added on top; the earlier ones stay. |
| `fingerprint_file(path)` | The fingerprint of a picture file on your computer (the SHA-256 of the file). The file never leaves your computer. |

It reads `proof.notpab.testnet` and `card.notpab.testnet` on NEAR testnet, with the same read and the same rule the site uses (`../web/scripts/near-read.mjs`, `../web/scripts/agent-rule.mjs`).

## Add it

Needs Node 20.9 or newer. From this folder:

```
npm install
```

Claude Code:

```
claude mcp add --transport stdio tally-near -- node "$(pwd)/server.mjs"
```

Codex:

```
codex mcp add tally-near -- node "$(pwd)/server.mjs"
```

Then ask: "Is card 776b729a98a45576e4381c7732d4b0eafcbec4eecc114c79116d9a7002258dbe real?"

You should get allow: NEAR says Real, with 2 entries, first recorded Fake and then corrected to Real.

## Try it without either

```
node try.mjs
```

It starts the server the way a client would, lists the three tools and asks about sample card A on NEAR testnet. You should see `ALLOW: goes ahead. NEAR says Real; ...` and `Its verdicts, oldest first: Fake, then Real.`

## Tests

```
npm test
```

You should see `pass 10`. NEAR is faked in them.

## Settings

All optional: `NEAR_RPC_URL`, `TALLY_REGISTRY` and `TALLY_CARDS` point it at another NEAR node or another deployment of the contracts.
