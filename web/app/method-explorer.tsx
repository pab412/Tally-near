"use client";

// The For AI agents page's read methods: pick one, and the page prints the call to copy and runs it, so the answer
// shown is whatever NEAR says right now. The call is built by the same function the site itself reads NEAR with.

import { useState } from "react";
import { READ_METHODS, readArgs, type ContractName } from "@/lib/agent-api";
import { curlFor } from "@/lib/near";
import { useCopy } from "./copy-link";
import { LiveAnswer } from "./live";
import { Frame, LiveTag } from "./parts";

function CopyButton({ text }: { text: string }) {
  const [copied, copy] = useCopy(() => text);
  return (
    <button type="button" className="link-btn" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** `fingerprint` is the card the reads ask about; `contracts` says where each contract lives. */
export function MethodExplorer({ fingerprint, contracts }: { fingerprint: string; contracts: Record<ContractName, string> }) {
  const [picked, setPicked] = useState(0);
  const read = READ_METHODS[picked];
  const contractId = contracts[read.contract];
  const args = readArgs(read, fingerprint);
  const curl = curlFor(read.method, args, contractId);

  return (
    <Frame title="Read methods, free" aside={<LiveTag>Answered by NEAR just now</LiveTag>}>
      <div className="tabs" role="tablist" aria-label="Read methods">
        {READ_METHODS.map((m, i) => (
          <button key={m.method} type="button" role="tab" id={`read-tab-${m.method}`} aria-selected={i === picked} aria-controls="read-panel" onClick={() => setPicked(i)}>
            {m.method}
          </button>
        ))}
      </div>
      <div className="explorer" role="tabpanel" id="read-panel" aria-labelledby={`read-tab-${read.method}`}>
        <p>
          {read.what} <span className="id muted">{contractId}</span>
        </p>
        <p className="label">
          The call <CopyButton key={read.method} text={curl} />
        </p>
        <pre className="code">
          <code>{curl}</code>
        </pre>
        <p className="label">What NEAR answers</p>
        <LiveAnswer key={read.method} method={read.method} args={args} contractId={contractId} />
      </div>
    </Frame>
  );
}
