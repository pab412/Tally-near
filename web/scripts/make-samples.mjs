// Draws the SAMPLE PnL card pictures in public/samples. Every figure is made up and every card says SAMPLE.
// Run once with `node scripts/make-samples.mjs` (it fetches the Geist fonts from Google Fonts). The PNGs are
// committed: re-running can change their bytes, and then their fingerprints change and they need recording again.

import { mkdir, writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";

const W = 1600, H = 900;
const INK = "#08090c", TEXT = "#f4f3f5", MUTED = "#8b8b98", UP = "#62d5a2", DOWN = "#ff7e8a";

// entry and exit give the ROI: (exit / entry - 1) x leverage, negated for a short
const cards = [
  { file: "sample-card-a.png", pair: "SAMPLE / USDC", side: "Spot", roi: "+1,240.05%", entry: "0.00412", exit: "0.05521", held: "2d 4h", up: true, seed: 7, bend: 3.2 },
  { file: "sample-card-b.png", pair: "DEMO / SOL", side: "Long 5×", roi: "+38.21%", entry: "1.2040", exit: "1.2960", held: "3h 12m", up: true, seed: 21, bend: 1.25 },
  { file: "sample-card-c.png", pair: "TEST / USDC", side: "Short 10×", roi: "−12.71%", entry: "0.8810", exit: "0.8922", held: "47m", up: false, seed: 34, bend: 0.8 },
];

async function font(family, weight) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`, { headers: { "User-Agent": "Mozilla/4.0" } })).text();
  const url = css.match(/src: url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error(`No TTF for ${family} ${weight}`);
  return { name: family, weight, style: "normal", data: await (await fetch(url)).arrayBuffer() };
}

/** The card's PnL over the trade as a line: a seeded walk that ends where the card says it ended. */
function line({ seed, up, bend }) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const n = 60, x0 = 760, x1 = W + 6, top = 250, bottom = 690; // the line runs off the right edge
  const pts = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const trend = up ? bottom - (bottom - top) * t ** bend : top + 70 + (bottom - top - 70) * t ** bend;
    const wobble = (rand() - 0.5) * 90 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    return [x0 + (x1 - x0) * t, Math.max(top - 20, Math.min(bottom + 20, trend + wobble))];
  });
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { d, area: `${d} L${x1} ${H} L${x0} ${H} Z` };
}

function backdrop(c) {
  const col = c.up ? UP : DOWN, { d, area } = line(c);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.86" cy="0.2" r="0.75"><stop offset="0" stop-color="${col}" stop-opacity="0.2"/><stop offset="0.55" stop-color="${col}" stop-opacity="0.03"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity="0.26"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0.5" stop-color="${INK}"/><stop offset="0.8" stop-color="${INK}" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${[250, 360, 470, 580, 690].map((y) => `<line x1="760" x2="${W}" y1="${y}" y2="${y}" stroke="#ffffff" stroke-opacity="0.05"/>`).join("")}
  <path d="${area}" fill="url(#fill)"/>
  <path d="${d}" fill="none" stroke="${col}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#ffffff" stroke-opacity="0.1"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const box = (style, ...children) => h("div", { style: { display: "flex", ...style } }, ...children);
const stat = (label, value) =>
  box({ flexDirection: "column", marginRight: 72 }, box({ fontSize: 24, color: MUTED }, label), box({ fontFamily: "Geist Mono", fontSize: 40, marginTop: 10 }, value));

function card(c) {
  const col = c.up ? UP : DOWN;
  return box(
    { width: W, height: H, position: "relative", background: INK, color: TEXT, fontFamily: "Geist", fontWeight: 500 },
    h("img", { src: backdrop(c), width: W, height: H, style: { position: "absolute", left: 0, top: 0 } }),
    box(
      { position: "absolute", left: 0, top: 0, width: W, height: H, flexDirection: "column", padding: "72px 80px 64px" },
      box(
        { alignItems: "center", justifyContent: "space-between" },
        box(
          { alignItems: "center", fontSize: 30, color: "#c9c9d2" },
          box({ width: 18, height: 18, background: col, transform: "rotate(45deg)", marginRight: 20 }),
          "Sample Perps",
        ),
        box({ fontFamily: "Geist Mono", fontSize: 22, letterSpacing: 7, color: TEXT, border: "1.5px solid rgba(244,243,245,0.5)", padding: "9px 12px 9px 19px" }, "SAMPLE"),
      ),
      box(
        { alignItems: "center", marginTop: 92 },
        box({ fontSize: 46, fontWeight: 700, letterSpacing: -1 }, c.pair),
        box({ marginLeft: 24, fontFamily: "Geist Mono", fontSize: 24, color: col, border: `1.5px solid ${col}`, padding: "7px 14px", borderRadius: 2 }, c.side),
      ),
      box({ fontSize: c.roi.length > 8 ? 168 : 216, fontWeight: 700, letterSpacing: c.roi.length > 8 ? -6 : -7, lineHeight: 1, color: col, marginTop: 34 }, c.roi),
      box({ marginTop: 56 }, stat("Entry price", c.entry), stat("Exit price", c.exit), stat("Held", c.held)),
      box({ marginTop: "auto", fontSize: 22, color: MUTED }, "Made-up card for the Tally on NEAR demo. Not a real trade."),
    ),
  );
}

const fonts = await Promise.all([font("Geist", 500), font("Geist", 700), font("Geist Mono", 500)]);
const dir = new URL("../public/samples/", import.meta.url);
await mkdir(dir, { recursive: true });
for (const c of cards) {
  const png = Buffer.from(await new ImageResponse(card(c), { width: W, height: H, fonts }).arrayBuffer());
  await writeFile(new URL(c.file, dir), png);
  console.log("wrote", c.file, png.length, "bytes");
}
