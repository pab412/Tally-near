// Server only: the front page's example fingerprints, computed from a sample card's real bytes rather than typed in.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A sample card's fingerprint, and the fingerprint of the same file with its last byte changed by one bit. */
export function sampleFingerprints(file: string): { fingerprint: string; oneByteChanged: string } {
  const bytes = readFileSync(join(process.cwd(), "public/samples", file));
  const nudged = Uint8Array.from(bytes);
  nudged[nudged.length - 1] ^= 1;
  return { fingerprint: sha256(bytes), oneByteChanged: sha256(nudged) };
}
