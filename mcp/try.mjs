// Starts the MCP server the way Claude Code or Codex would, lists its tools, and asks it about sample card A.
// It talks to NEAR testnet for real. Run: node try.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const SAMPLE_A = "776b729a98a45576e4381c7732d4b0eafcbec4eecc114c79116d9a7002258dbe";
const here = (file) => fileURLToPath(new URL(file, import.meta.url));

const client = new Client({ name: "tally-near-try", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [here("./server.mjs")], env: process.env }));

const { tools } = await client.listTools();
console.log(`The server offers ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

const ask = async (name, args) => (await client.callTool({ name, arguments: args })).content[0].text;
const checked = await ask("check_card", { fingerprint: SAMPLE_A });
console.log(`check_card(sample card A)\n${checked}\n`);
console.log(`card_history(sample card A)\n${(await ask("card_history", { fingerprint: SAMPLE_A })).split("\n")[0]}\n`);
const file = await ask("fingerprint_file", { path: here("../web/public/samples/sample-card-a.png") });
console.log(`fingerprint_file(web/public/samples/sample-card-a.png)\n${file.split("\n")[0]}`);

await client.close();
// sample card A is Real on the registry, after a correction, and its file is in this repository
process.exit(checked.startsWith("ALLOW") && file.startsWith(SAMPLE_A) ? 0 : 1);
