// A card's fingerprint: the SHA-256 hash of the picture's exact bytes, as 64 lower-case hex characters.
// It's computed in the browser, so the picture itself never leaves the visitor's device.

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

export function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_RE.test(value);
}

export async function fingerprint(bytes: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
