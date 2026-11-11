// A verified card's picture: the card itself with a "Verified on NEAR" stamp. The card contract gives every token
// the link /badge/<fingerprint>.png, and wallets and explorers show what this answers. It is drawn on request and
// only for a card that still stands (lib/badge.ts), so nothing here is stored and nothing can go stale.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { badgeFor } from "@/lib/badge";
import { CARD_CONTRACT_ID, CONTRACT_ID, formatDay, latestRecord, shortFingerprint, verifiedCard } from "@/lib/near";
import { samplePicture, type Picture } from "@/lib/sample";

const SIZE = 1200;
const EDGE = 60;
const INNER = SIZE - 2 * EDGE;

// each file is named in full, so the build knows exactly which files this route reads
const FONTS = [
  { name: "Geist", data: readFileSync(join(process.cwd(), "assets/fonts/Geist-Medium.ttf")), weight: 500, style: "normal" },
  { name: "Geist", data: readFileSync(join(process.cwd(), "assets/fonts/Geist-Bold.ttf")), weight: 700, style: "normal" },
  { name: "Geist Mono", data: readFileSync(join(process.cwd(), "assets/fonts/GeistMono-Medium.ttf")), weight: 500, style: "normal" },
] as const;
const png = (bytes: Buffer) => `data:image/png;base64,${bytes.toString("base64")}`;
const LOGO = png(readFileSync(join(process.cwd(), "public/tally-t.png")));

// the site's own background: near black with faint diagonal pink and violet streaks
const streak = (id: string, colour: string, strength: number, cx: number, cy: number, rx: number, ry: number) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${colour}" stop-opacity="${strength}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>` +
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`;
const BACKDROP = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#08090c"/><g transform="rotate(-28 600 600)">` +
    streak("a", "#ff248b", 0.24, 840, 300, 640, 36) +
    streak("b", "#b266ff", 0.18, 720, 372, 460, 22) +
    streak("c", "#ff248b", 0.16, 300, 800, 560, 30) +
    streak("d", "#ff46aa", 0.12, 900, 1040, 500, 24) +
    `</g></svg>`,
).toString("base64")}`;

/** The card's place when the site has no picture of it: its fingerprint, in full. */
function NoPicture({ fingerprint }: { fingerprint: string }) {
  const groups = fingerprint.match(/.{8}/g)!;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 64px", backgroundColor: "#0d0e12" }}>
      <span style={{ color: "#9c9ca9", fontSize: 28, marginBottom: 28 }}>This card&apos;s fingerprint</span>
      {[groups.slice(0, 4), groups.slice(4)].map((row) => (
        <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", fontFamily: "Geist Mono", fontSize: 44, lineHeight: 1.6, color: "#c6c2cb" }}>
          {row.map((group) => (
            <span key={group}>{group}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function BadgePicture({ fingerprint, recordedAtMs, picture }: { fingerprint: string; recordedAtMs: number; picture: Picture | null }) {
  const height = Math.round(picture ? (INNER * picture.height) / picture.width : (INNER * 9) / 16);
  const label = { fontSize: 26, color: "#9c9ca9" };
  const value = { fontFamily: "Geist Mono", fontSize: 34, marginTop: 10 };
  return (
    <div style={{ width: SIZE, height: SIZE, display: "flex", flexDirection: "column", justifyContent: "center", padding: `0 ${EDGE}px`, color: "#f4f3f5", fontFamily: "Geist", fontWeight: 500 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
      <img src={BACKDROP} alt="" width={SIZE} height={SIZE} style={{ position: "absolute", left: 0, top: 0 }} />
      <div style={{ display: "flex", alignItems: "center", marginBottom: 56, fontSize: 36, letterSpacing: -1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
        <img src={LOGO} alt="" width={41} height={46} />
        <span style={{ marginLeft: 16, fontWeight: 700 }}>Tally</span>
        <span style={{ marginLeft: 12, color: "#9c9ca9" }}>on NEAR</span>
      </div>
      <div style={{ position: "relative", display: "flex", width: INNER, height, border: "2px solid rgba(239,233,223,.22)" }}>
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page
          <img src={png(picture.png)} alt="" width={INNER - 4} height={height - 4} />
        ) : (
          <NoPicture fingerprint={fingerprint} />
        )}
        <div
          style={{
            position: "absolute",
            right: -22,
            top: -34,
            display: "flex",
            alignItems: "center",
            padding: "14px 24px 14px 18px",
            backgroundColor: "#62d5a2",
            color: "#08090c",
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: -1,
            transform: "rotate(4deg)",
            boxShadow: "0 10px 40px rgba(0,0,0,.6)",
          }}
        >
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#08090c" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
          <span style={{ marginLeft: 14 }}>VERIFIED ON NEAR</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 44 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={label}>Card</span>
          <span style={value}>{shortFingerprint(fingerprint)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={label}>Recorded on NEAR (UTC)</span>
          <span style={value}>{formatDay(recordedAtMs, "UTC")}</span>
        </div>
      </div>
    </div>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const badge = await badgeFor((await params).file, {
    verifiedCard: (fingerprint) => verifiedCard(fingerprint, { contractId: CARD_CONTRACT_ID }),
    latestRecord: (fingerprint) => latestRecord(fingerprint, { contractId: CONTRACT_ID }),
  });
  if (!badge.ok) return new Response(badge.message, { status: badge.status, headers: { "Cache-Control": "no-store" } });
  return new ImageResponse(<BadgePicture fingerprint={badge.fingerprint} recordedAtMs={badge.recordedAtMs} picture={samplePicture(badge.fingerprint)} />, {
    width: SIZE,
    height: SIZE,
    fonts: [...FONTS],
    // a card can be burned at any time, so its picture is never kept for long
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
