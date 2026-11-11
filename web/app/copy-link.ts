"use client";

import { useState } from "react";
import { recordPath } from "@/lib/fingerprint";

/** A copy button's state: whether the text has been copied, and the action that copies it. */
export function useCopy(text: () => string): [copied: boolean, copy: () => void] {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(text()).then(
      () => setCopied(true),
      () => undefined, // a browser that refuses leaves the button as it was
    );
  return [copied, copy];
}

/** The link that opens a card's record, for a copy button. */
export const useRecordLink = (fp: string) => useCopy(() => window.location.origin + recordPath(fp));
