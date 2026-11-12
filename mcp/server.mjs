#!/usr/bin/env node
// Tally's MCP server: lets Claude Code, Codex or any agent ask Tally's registry on NEAR "is this PnL card real?".
// Three tools, all free reads (tools.mjs). No account, no key, nothing paid, nothing written.
//
// Run: node server.mjs   (it speaks MCP over stdin and stdout, so a client starts it; see README.md)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cardHistory, checkCard, fingerprintFile, inWords } from "./tools.mjs";

const fingerprint = z.string().describe("The card's fingerprint: the SHA-256 of its picture file, 64 lower-case hex characters");
const TOOLS = [
  {
    name: "check_card",
    title: "Check a PnL card",
    description:
      "Ask Tally's registry on NEAR whether a crypto PnL card is real. Answers allow (Real), warn (Unclear: stop and ask your owner) or block (Fake, no record, or the registry didn't answer), with the reasons from the card's record.",
    inputSchema: { fingerprint },
    run: ({ fingerprint }) => checkCard(fingerprint),
  },
  {
    name: "card_history",
    title: "A card's history",
    description: "Every verdict Tally has recorded for a PnL card on NEAR, oldest first. A corrected verdict is added on top; the earlier ones stay.",
    inputSchema: { fingerprint },
    run: ({ fingerprint }) => cardHistory(fingerprint),
  },
  {
    name: "fingerprint_file",
    title: "Fingerprint a picture file",
    description: "The fingerprint of a PnL card picture on this computer (the SHA-256 of the file). The file never leaves this computer.",
    inputSchema: { path: z.string().describe("The path of the picture file") },
    run: ({ path }) => fingerprintFile(path),
  },
];

const server = new McpServer({ name: "tally-near", version: "0.1.0" });
for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: { readOnlyHint: true, openWorldHint: tool.name !== "fingerprint_file" } },
    async (args) => {
      try {
        const answer = await tool.run(args);
        return { content: [{ type: "text", text: `${inWords[tool.name](answer)}\n\n${JSON.stringify(answer, null, 2)}` }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : "That didn't work." }] };
      }
    },
  );
}
await server.connect(new StdioServerTransport());
