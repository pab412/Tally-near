import { tallyChecks } from "@/lib/ledger";

// Tally's own real checks, as tallypnl.com lists them: fingerprints and counts only. The ledger asks NEAR about each
// fingerprint itself; this route only says which ones there are. Asked of Tally at most once a minute.
const SOURCE = process.env.TALLY_CHECKS_URL || "https://tallypnl.com/api/near";

export const revalidate = 60;

export async function GET() {
  const checks = await tallyChecks(SOURCE);
  // nothing readable from Tally just now: an empty list, so the ledger shows what this site can name itself
  return Response.json(checks ?? { records: [], tally: { counted: 0, caught: 0 } });
}
