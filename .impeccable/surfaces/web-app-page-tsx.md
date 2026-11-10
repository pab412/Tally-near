---
version: 1
slug: "web-app-page-tsx"
primary_target: "web/app/page.tsx"
related_targets: []
---

## Scope

Tally on NEAR demo page (`web/app/page.tsx`). Mode: Operate. Audience: traders checking a card and NEAR hackathon judges, equally. Job: drop a PnL card picture, see Tally's on-chain verdict; demo-record a check (password). Constraints: picture never leaves the device; testnet only; everything demo is labelled SAMPLE; no real names.

## Direction contract

THESIS: A card gets a review and the verdict lands like a referee's decision on a broadcast: one hard-cut bar, read in a glance. Refuses the category default of a centred upload box over a rounded result card with a pill badge.

OWN-WORLD: Near-black ground #0B0B0D, panels a step up, hairline rules. Pink #FF248B only on what can be pressed and on the verdict bar. Verdict state colours: Fake pink, Real green, Unclear amber, all on near-black. One clean grotesk for words, one mono for data. One body size; weight and the verdict bar carry hierarchy.

STORY: The visitor drops a card (or a SAMPLE), sees its fingerprint computed on their own device, watches "Checking NEAR" cut to the decision, then follows the explorer link to see it's real. Judges then read how it works in three lines.

FIRST VIEWPORT: Top bar: wordmark, two tabs (Look up a card / Record a check), network tag. Left column: drop zone with SAMPLE card shortcuts under it, then the fingerprint as mono text plus a 64-bar code. Right column: the decision panel: label, the verdict bar full column width (key block "CHECKED" + verdict word large), date line, explorer link, history list with right-aligned tabular dates. Empty state: "Tally hasn't checked this card yet."

FORM: Broadcast Decision, position 5 of the grounded list (VAR-style decision graphics). seed:8af0537c6d790c93. Signature move: the decision cut, a status strip that reads CHECKING and hard-cuts (two-step, no easing) to the verdict bar; static under reduced motion. Raises: fingerprint as dense mono and bar code (Data Field); pink only on actions and the verdict (Warm Consumer App); one body size (Acetate Manual); right-aligned tight dates (Mixtape J-Card); reflow by whole columns (Grid Specimen); one size ramp for entries (Star Atlas).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

The user did not answer the direction round (page and chat); built on the assigned direction unattended.
