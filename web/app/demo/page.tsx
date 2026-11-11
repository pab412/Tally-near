import type { Metadata } from "next";
import { fingerprintFromParam } from "@/lib/fingerprint";
import { writesEnabled } from "@/lib/demo";
import { CARD_CONTRACT_ID, CONTRACT_ID } from "@/lib/near";
import TallyDemo from "../tally-demo";

export const metadata: Metadata = { title: "The demo: look a card up on NEAR" };

// Read the server's settings on each request, so turning the demo's writes on or off needs no rebuild.
export const dynamic = "force-dynamic";

export default async function Demo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // A link like /demo?fp=<fingerprint> (a Tally card's QR code) opens that card's record straight away.
  const initialFp = fingerprintFromParam((await searchParams).fp);
  const who = { password: process.env.RECORD_PASSWORD, account: process.env.NEAR_ATTESTER_ACCOUNT };
  return (
    <TallyDemo
      contractId={CONTRACT_ID}
      cardContractId={CARD_CONTRACT_ID}
      canRecord={writesEnabled({ ...who, key: process.env.NEAR_ATTESTER_KEY })}
      canMint={writesEnabled({ ...who, key: process.env.NEAR_CARD_KEY })}
      initialFp={initialFp}
    />
  );
}
