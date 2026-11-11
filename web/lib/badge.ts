// What a verified card's picture link answers. The picture is drawn only while the card contract still holds the
// card and the registry's latest verdict is still Real, so the picture can't outlive the verdict it stands for:
// a card that was corrected stops showing "Verified" even before anyone asks the contract to burn it.

import { isFingerprint } from "./fingerprint";
import type { ProofRecord, VerifiedCard } from "./near";

export type Badge = { ok: true; fingerprint: string; recordedAtMs: number } | { ok: false; status: 404 | 502; message: string };

/** How the two contracts are read. Either may throw when NEAR can't be reached. */
export interface BadgeReads {
  verifiedCard: (fingerprint: string) => Promise<VerifiedCard | null>;
  latestRecord: (fingerprint: string) => Promise<ProofRecord | null>;
}

const none = (message: string): Badge => ({ ok: false, status: 404, message });

/** `file` is the last part of the link, `<fingerprint>.png`: the form the card contract gives every token. */
export async function badgeFor(file: string, reads: BadgeReads): Promise<Badge> {
  const fingerprint = file.endsWith(".png") ? file.slice(0, -4) : "";
  if (!isFingerprint(fingerprint)) return none("That isn't a verified card's picture link.");
  let card: VerifiedCard | null, record: ProofRecord | null;
  try {
    [card, record] = await Promise.all([reads.verifiedCard(fingerprint), reads.latestRecord(fingerprint)]);
  } catch {
    return { ok: false, status: 502, message: "NEAR couldn't be reached, so the picture wasn't drawn. Try again in a moment." };
  }
  if (!card) return none("There is no verified card for this fingerprint.");
  if (record?.latest.verdict !== "Real") return none("This card's verdict was corrected, so its verified card no longer stands.");
  return { ok: true, fingerprint, recordedAtMs: record.latest.recorded_at_ms };
}
