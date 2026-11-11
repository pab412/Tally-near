// A card's fingerprint: the SHA-256 hash of the picture's exact bytes, as 64 lower-case hex characters.
// It's computed in the browser, so the picture itself never leaves the visitor's device.

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

export function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_RE.test(value);
}

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

export async function fingerprint(bytes: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
