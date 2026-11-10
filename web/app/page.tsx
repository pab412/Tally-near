import { CONTRACT_ID } from "@/lib/near";
import { recordingEnabled } from "@/lib/record";
import TallyDemo from "./tally-demo";

// Read the server's settings on each request, so turning recording on or off needs no rebuild.
export const dynamic = "force-dynamic";

export default function Home() {
  const canRecord = recordingEnabled({
    password: process.env.RECORD_PASSWORD,
    account: process.env.NEAR_ATTESTER_ACCOUNT,
    key: process.env.NEAR_ATTESTER_KEY,
  });
  return <TallyDemo contractId={CONTRACT_ID} canRecord={canRecord} />;
}
