// Makes the SAMPLE PnL card pictures in public/samples. Every figure is made up and every card says SAMPLE.
// Run once with `node scripts/make-samples.mjs`. The PNGs are committed: re-running changes their bytes, so their
// fingerprints change and they'd need recording again.

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const cards = [
  { file: "sample-card-a.png", pair: "$SAMPLE / USDC", side: "LONG 25x", pnl: "+1,240.5%", entry: "0.00412", exit: "0.05521", up: true },
  { file: "sample-card-b.png", pair: "$DEMO / SOL", side: "LONG 5x", pnl: "+38.2%", entry: "1.204", exit: "1.296", up: true },
  { file: "sample-card-c.png", pair: "$TEST / USDC", side: "SHORT 10x", pnl: "-12.7%", entry: "0.881", exit: "0.892", up: false },
];

const svg = (c) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#16161B"/><stop offset="1" stop-color="#0B0B0D"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect x="24" y="24" width="1152" height="627" rx="28" fill="none" stroke="#2A2A31" stroke-width="2"/>
  <g font-family="Segoe UI, Arial, sans-serif">
    <text x="80" y="120" fill="#A1A1AA" font-size="30" font-weight="600">${c.pair}</text>
    <text x="80" y="170" fill="${c.up ? "#2BD576" : "#FF5A5F"}" font-size="28" font-weight="700">${c.side}</text>
    <text x="80" y="340" fill="${c.up ? "#2BD576" : "#FF5A5F"}" font-size="150" font-weight="800">${c.pnl}</text>
    <text x="80" y="450" fill="#A1A1AA" font-size="26">Entry price</text>
    <text x="80" y="492" fill="#F4F4F5" font-size="34" font-weight="700">${c.entry}</text>
    <text x="380" y="450" fill="#A1A1AA" font-size="26">Exit price</text>
    <text x="380" y="492" fill="#F4F4F5" font-size="34" font-weight="700">${c.exit}</text>
    <text x="80" y="600" fill="#71717A" font-size="22">Made-up card for the Tally on NEAR demo. Not a real trade.</text>
    <g transform="translate(1100 110)">
      <rect x="-190" y="-44" width="190" height="60" rx="10" fill="#F5B83D"/>
      <text x="-95" y="-4" text-anchor="middle" fill="#0B0B0D" font-size="30" font-weight="800" letter-spacing="4">SAMPLE</text>
    </g>
    <text x="1120" y="540" text-anchor="end" fill="#F5B83D" fill-opacity="0.16" font-size="130" font-weight="900" letter-spacing="10">SAMPLE</text>
  </g>
</svg>`;

await mkdir(new URL("../public/samples/", import.meta.url), { recursive: true });
for (const c of cards) {
  const out = fileURLToPath(new URL(`../public/samples/${c.file}`, import.meta.url));
  await sharp(Buffer.from(svg(c))).png({ compressionLevel: 9 }).toFile(out);
  console.log("wrote", c.file);
}
