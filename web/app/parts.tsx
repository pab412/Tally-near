// What the page's panels share: the picked card, the answer from NEAR, the verdict bar and the "switched off" notice.

import type { ReactNode } from "react";
import type { Lookup, Verdict, VerifiedCard } from "@/lib/near";
import { ExternalIcon, LockIcon } from "./icons";

/** `preview` is null for a card opened from a link: there's a fingerprint, but no picture on this device. */
export type Card = { name: string; fp: string; preview: string | null; sample: boolean };

/** A card's verified card, none, or "unknown" when the card contract couldn't be read. */
export type Held = VerifiedCard | null | "unknown";

export type LookState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; result: Lookup; held: Held }
  | { phase: "error"; message: string };

export const README = "https://github.com/pab412/Tally-near#try-recording-yourself";

/** The one loud thing on the page: a small key block and one big word, coloured by verdict. */
export function VerdictBar({ tone, keyText, word }: { tone: Verdict | "none"; keyText: string; word: string }) {
  return (
    <div className="verdict-bar" data-verdict={tone}>
      <span className="verdict-key">{keyText}</span>
      <span className="verdict-word">{word}</span>
    </div>
  );
}

/** Shown in place of a form when this copy of the page has no key for that kind of write. */
export function SwitchedOff({ head, children }: { head: string; children: ReactNode }) {
  return (
    <div className="notice">
      <p className="notice-head">
        <LockIcon /> {head}
      </p>
      <p>{children}</p>
      <a href={README} target="_blank" rel="noreferrer">
        Try it yourself <ExternalIcon />
      </a>
    </div>
  );
}

/** Sends one of the demo's writes to the server. Answers the JSON body, or the message to show. */
export async function send<T>(path: string, body: object): Promise<{ ok: true; body: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, message: json.error ?? "That didn't work. Try again." };
    return { ok: true, body: json as T };
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach the server. Check your connection and try again." };
  }
}
