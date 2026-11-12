// The "Verified card" demo. The browser asks to mint a card's NFT to a holder, or to recheck one against the proof
// registry; the server checks the request (lib/demo.ts) and signs with a key that can only call those two methods
// on the card contract. Whether a card may be minted, or has to be burned, is the contract's decision, not this
// server's: it asks the registry on-chain, and its refusals are passed on in its own words.

import { admit, demoMayWrite, fail, notWritten, refused, type DemoEnv, type Fail, type Signer } from "./demo";
import { isTestnetAccount, type VerifiedCard } from "./near";

export type CardRequest = Signer & { fingerprint: string } & ({ action: "mint"; holder: string } | { action: "recheck" });

/** `card` after a mint; `stands` after a recheck (false: the contract burned the card). */
export interface CardOutcome {
  txHash: string;
  card?: VerifiedCard;
  stands?: boolean;
}

export type SignCard = (req: CardRequest) => Promise<CardOutcome>;

export type CardResult = { status: 200; body: CardOutcome } | Fail;

const PANIC = "Smart contract panicked: ";

/** What the contract said when it refused, or null when the failure was something else. */
function contractRefusal(err: unknown): string | null {
  const message = err instanceof Error ? err.message : "";
  const at = message.indexOf(PANIC);
  return at < 0 ? null : message.slice(at + PANIC.length, at + PANIC.length + 200);
}

export async function handleCard(body: unknown, env: DemoEnv, sign: SignCard): Promise<CardResult> {
  const admitted = admit(body, env, "Verified cards are switched off on this copy of the page.");
  if (refused(admitted)) return admitted;
  const { input, fingerprint, signer } = admitted;

  let request: CardRequest;
  if (input.action === "mint") {
    if (!isTestnetAccount(input.holder)) return fail(422, "The holder has to be a NEAR testnet account, like name.testnet.");
    // a mint is never for one of Tally's own checks: that card is never minted to whoever asks. (A card with no
    // record is passed on, and the contract refuses it in its own words.)
    // (A recheck is open to anyone on the contract, so the demo needs no rule for it.)
    const notHere = await demoMayWrite(fingerprint, env.read, false);
    if (notHere) return notHere;
    request = { ...signer, fingerprint, action: "mint", holder: input.holder };
  } else if (input.action === "recheck") {
    request = { ...signer, fingerprint, action: "recheck" };
  } else {
    return fail(422, "Choose mint or recheck.");
  }

  try {
    return { status: 200, body: await sign(request) };
  } catch (err) {
    const said = contractRefusal(err);
    return said ? fail(409, said) : notWritten(`card ${request.action}`, err);
  }
}
