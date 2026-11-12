// The developer half of the For AI agents page: every method an agent or its owner calls, what `check` answers, and
// what the contracts refuse, in the contracts' own words. tests/agent-api.test.ts checks each method and each
// sentence against the contract source, so the page can't describe a call that isn't there.

export type ContractName = "proof" | "check";

/** A free read the page can run live: which contract, which method, and whether it takes a card's fingerprint. */
export interface ReadMethod {
  contract: ContractName;
  method: string;
  takesFingerprint: boolean;
  what: string;
}

export const READ_METHODS: readonly ReadMethod[] = [
  { contract: "proof", method: "get", takesFingerprint: true, what: "A card's latest verdict and how many entries it has. null for a card Tally never checked." },
  { contract: "proof", method: "history", takesFingerprint: true, what: "Every entry for a card, oldest first: the first verdict and each correction since." },
  { contract: "proof", method: "cards", takesFingerprint: false, what: "How many cards have a record." },
  { contract: "check", method: "terms", takesFingerprint: false, what: "What a paid check costs, the trader's share, the two contracts it asks and how many checks it has answered." },
];

/** What a read method is called with: the card's fingerprint, or nothing. */
export const readArgs = (method: ReadMethod, fingerprint: string): object => (method.takesFingerprint ? { fingerprint } : {});

/** The paid check contract's methods, in the order an owner and their agent use them. */
export const PAID_METHODS: readonly { call: string; method: string; who: string; what: string }[] = [
  { call: "deposit(account_id)", method: "deposit", who: "The owner", what: "Loads the attached NEAR as credit for an account. That credit is all the agent can spend." },
  { call: "check(fingerprint)", method: "check", who: "The agent", what: "Asks the registry and the card contract in one call. One fee, taken only when there is a record to give." },
  { call: "refund()", method: "refund", who: "The owner", what: "Sends the caller's unspent credit back to them." },
  { call: "credit_of(account_id)", method: "credit_of", who: "Anyone, free", what: "What an account has left to spend, in yoctoNEAR." },
  { call: "terms()", method: "terms", who: "Anyone, free", what: "The fee, the trader's share and how many checks were answered." },
];

/** The guard wallet's methods (contracts/guard), in the order an owner and their agent use them. */
export const GUARD_METHODS: readonly { call: string; method: string; who: string; what: string }[] = [
  { call: "deposit(limit)", method: "deposit", who: "The owner", what: "Loads the attached NEAR into the caller's own wallet and sets the most one payment may be." },
  { call: "pay(fingerprint, amount)", method: "pay", who: "The agent", what: "Asks the registry about the card first. Its holder is paid only if the answer is Real. Anything else is refused, with why." },
  { call: "refund()", method: "refund", who: "The owner", what: "Sends back what the caller's wallet still holds." },
  { call: "wallet_of(account_id)", method: "wallet_of", who: "Anyone, free", what: "What an account's wallet holds, and its limit." },
];

/**
 * What a wallet adds to ask the registry before it pays: the lines that matter from contracts/guard, shortened.
 * tests/agent-api.test.ts checks each name in it against the contracts.
 */
export const WALLET_CODE = `use tally_types::{decide, proof_registry, Decision, Record};

// before any money moves, ask the registry about the card
pub fn pay(&mut self, fingerprint: String, amount: U128) -> Promise {
    proof_registry::ext(self.registry.clone())
        .get(fingerprint.clone())
        .then(Self::ext(env::current_account_id()).on_asked(fingerprint, amount))
}

#[private]
pub fn on_asked(&mut self, fingerprint: String, amount: U128,
    #[callback_result] record: Result<Option<Record>, PromiseError>) {
    // no answer is no record, and both are a block
    match decide(record.ok().flatten().as_ref()) {
        Decision::Allow => { /* pay the card's holder */ }
        Decision::Warn => { /* stop: ask the owner */ }
        Decision::Block => { /* refuse */ }
    }
}`;

/** The fields of what `check` answers (the contract's `Answer`). */
export const ANSWER_FIELDS: readonly { field: string; what: string }[] = [
  { field: "record", what: "The card's record, exactly as the registry gives it to anyone. null when Tally never checked the card." },
  { field: "held_by", what: "The account holding the card's verified card, when the card is Real and has one. Otherwise null." },
  { field: "charged", what: "What this check cost, in yoctoNEAR. \"0\" when there was no record." },
  { field: "to_trader", what: "The part of the fee paid into the trader's verified card, in yoctoNEAR." },
];

/** What a call is refused with, word for word, and the contract that says it. */
export const ERRORS: readonly { contract: ContractName; when: string; says: string }[] = [
  { contract: "check", when: "A check for something that isn't a fingerprint", says: "A fingerprint is 64 lower-case hex characters" },
  { contract: "check", when: "A check with less credit left than one fee", says: "Not enough credit for a check: the account's owner has to load more" },
  { contract: "check", when: "A check the registry couldn't answer", says: "The proof registry didn't answer, so nothing was charged" },
  { contract: "check", when: "A deposit smaller than one fee", says: "Load at least the price of one check" },
  { contract: "check", when: "A refund with nothing left", says: "There is no credit to send back" },
  { contract: "proof", when: "Anyone but Tally writing a record", says: "Only Tally's attester can record a check" },
  { contract: "proof", when: "A record with a bad check id", says: "A check id is 1 to 32 letters, digits, - or _" },
];
