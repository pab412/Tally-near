// A card's fingerprint: the SHA-256 hash of the picture's exact bytes, as 64 lower-case hex characters.
// It's computed in the browser, so the picture itself never leaves the visitor's device. What a fingerprint is lives
// in scripts/near-read.mjs, the one place the site, the scripts and the MCP server share.

import { fingerprint, isFingerprint } from "@/scripts/near-read.mjs";

export { fingerprint, isFingerprint };

/** Where the demo lives. The front page explains the idea and links here. */
export const DEMO_PATH = "/demo";

/** The fingerprint a link asks for (`/demo?fp=<fingerprint>`), or null when there is none or it isn't one. */
export function fingerprintFromParam(value: string | string[] | undefined | null): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return isFingerprint(first) ? first : null;
}

/** The link that opens a card's record directly: what a Tally card's QR code points to. */
export const recordPath = (fp: string) => `${DEMO_PATH}?fp=${fp}`;

/** A verified card's picture link: the same one the card contract gives the token (`badge/<fingerprint>.png`). */
export const badgePath = (fp: string) => `/badge/${fp}.png`;
