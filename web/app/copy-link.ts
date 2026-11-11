"use client";

import { useState } from "react";
import { recordPath } from "@/lib/fingerprint";

/** The link that opens a card's record, for a copy button: whether it has been copied, and the action that copies it. */
export function useRecordLink(fp: string): [copied: boolean, copy: () => void] {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(window.location.origin + recordPath(fp)).then(
      () => setCopied(true),
      () => undefined, // a browser that refuses leaves the button as it was
    );
  return [copied, copy];
}
