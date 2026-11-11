// Server only: the site's own sample cards (public/samples). Their fingerprints are computed from the real bytes
// rather than typed in, and they are the only pictures the site holds: a card a visitor picks never leaves their device.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "public/samples");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A sample card's fingerprint, and the fingerprint of the same file with its last byte changed by one bit. */
export function sampleFingerprints(file: string): { fingerprint: string; oneByteChanged: string } {
  const bytes = readFileSync(join(DIR, file));
  const nudged = Uint8Array.from(bytes);
  nudged[nudged.length - 1] ^= 1;
  return { fingerprint: sha256(bytes), oneByteChanged: sha256(nudged) };
}

export interface Picture {
  png: Buffer;
  width: number;
  height: number;
}

let byFingerprint: Map<string, string> | undefined;

/** The sample card with this fingerprint, or null: the site has no picture of any other card. */
export function samplePicture(fingerprint: string): Picture | null {
  byFingerprint ??= new Map(
    readdirSync(DIR)
      .filter((file) => file.endsWith(".png"))
      .map((file) => [sha256(readFileSync(join(DIR, file))), file]),
  );
  const file = byFingerprint.get(fingerprint);
  if (!file) return null;
  const png = readFileSync(join(DIR, file));
  // a PNG states its size at a fixed place: two 4-byte numbers after the 16-byte start of the file
  return { png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
