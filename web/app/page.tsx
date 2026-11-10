import { fingerprintFromParam } from "@/lib/fingerprint";
import { CONTRACT_ID } from "@/lib/near";
import { recordingEnabled } from "@/lib/record";
import TallyDemo from "./tally-demo";

// Read the server's settings on each request, so turning recording on or off needs no rebuild.
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // A link like /?fp=<fingerprint> (a Tally card's QR code) opens that card's record straight away.
  const initialFp = fingerprintFromParam((await searchParams).fp);
  const canRecord = recordingEnabled({
    password: process.env.RECORD_PASSWORD,
    account: process.env.NEAR_ATTESTER_ACCOUNT,
    key: process.env.NEAR_ATTESTER_KEY,
  });
  return <TallyDemo contractId={CONTRACT_ID} canRecord={canRecord} initialFp={initialFp} />;
}
