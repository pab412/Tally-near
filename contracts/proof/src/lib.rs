//! Tally's proof registry on NEAR.
//!
//! Tally (tallypnl.com) checks crypto PnL cards for fakes. Each time it finishes a check, its attester account
//! writes the result here: the card's fingerprint, the verdict and Tally's own check id. NEAR adds the time.
//!
//! What the chain gives that Tally's own database can't:
//! - A record can't be deleted or rewritten, by Tally or anyone else. A corrected verdict (after an appeal, say) is
//!   added as a new entry; the earlier ones stay in the history for everyone to see.
//! - Anyone, a person or an AI agent, can read a card's record without asking Tally.
//!
//! What is never stored: a name, a handle, a wallet or the picture. A fingerprint is a hash of the card image, so a
//! record says "this exact picture was checked, and this was the result", and nothing about who posted it.

use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, PanicOnDefault};
pub use tally_types::{is_fingerprint, Proof, ProofRegistry, Record, Verdict};

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Proofs,
    History { fingerprint: String },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TallyProof {
    /// The only account that may record: Tally's attester.
    attester: AccountId,
    proofs: LookupMap<String, Vector<Proof>>,
    /// How many different cards have a record.
    cards: u64,
}

const CHECK_ID_MAX: usize = 32;

/// Check ids are short and plain (letters, digits, - and _), so no name or link can be slipped into a record.
fn is_check_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= CHECK_ID_MAX && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[near]
impl TallyProof {
    #[init]
    pub fn new(attester: AccountId) -> Self {
        Self { attester, proofs: LookupMap::new(Key::Proofs), cards: 0 }
    }

    /// Records a check. Attester only. A card already on record gets a new entry on top; nothing is overwritten.
    pub fn record(&mut self, fingerprint: String, verdict: Verdict, check_id: String) -> Record {
        require!(env::predecessor_account_id() == self.attester, "Only Tally's attester can record a check");
        require!(is_fingerprint(&fingerprint), "A fingerprint is 64 lower-case hex characters");
        require!(is_check_id(&check_id), "A check id is 1 to 32 letters, digits, - or _");

        let proof = Proof { verdict, check_id, recorded_at_ms: env::block_timestamp_ms() };
        if !self.proofs.contains_key(&fingerprint) {
            self.proofs.insert(fingerprint.clone(), Vector::new(Key::History { fingerprint: fingerprint.clone() }));
            self.cards += 1;
        }
        let history = self.proofs.get_mut(&fingerprint).unwrap();
        history.push(proof.clone());
        let entries = history.len();

        // NEP-297 event, so indexers and agents can follow new records without polling
        env::log_str(&format!(
            r#"EVENT_JSON:{{"standard":"tally-proof","version":"1.0.0","event":"recorded","data":[{{"fingerprint":"{}","verdict":"{:?}","check_id":"{}","entry":{}}}]}}"#,
            fingerprint, proof.verdict, proof.check_id, entries
        ));
        Record { fingerprint, latest: proof, entries }
    }

    /// Every entry for a card, oldest first: the first verdict and each correction since.
    pub fn history(&self, fingerprint: String) -> Vec<Proof> {
        self.proofs.get(&fingerprint).map(|h| h.iter().cloned().collect()).unwrap_or_default()
    }

    /// How many different cards have a record.
    pub fn cards(&self) -> u64 {
        self.cards
    }

    pub fn attester(&self) -> AccountId {
        self.attester.clone()
    }
}

#[near]
impl ProofRegistry for TallyProof {
    fn get(&self, fingerprint: String) -> Option<Record> {
        let history = self.proofs.get(&fingerprint)?;
        let latest = history.get(history.len() - 1)?.clone();
        Some(Record { fingerprint, latest, entries: history.len() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::testing_env;

    const FP: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const FP2: &str = "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";

    fn tally() -> AccountId {
        "tally.testnet".parse().unwrap()
    }

    fn as_account(who: &str, at_ms: u64) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(who.parse().unwrap())
            .block_timestamp(at_ms * 1_000_000)
            .build());
    }

    fn fresh() -> TallyProof {
        as_account("tally.testnet", 1_000);
        TallyProof::new(tally())
    }

    #[test]
    fn a_check_is_recorded_with_the_chains_own_time() {
        let mut c = fresh();
        assert_eq!(c.get(FP.into()), None, "nothing on record before the check");
        let r = c.record(FP.into(), Verdict::Fake, "k3x9q2".into());
        assert_eq!(r.entries, 1);
        assert_eq!(r.latest, Proof { verdict: Verdict::Fake, check_id: "k3x9q2".into(), recorded_at_ms: 1_000 });
        assert_eq!(c.get(FP.into()), Some(r));
        assert_eq!(c.cards(), 1);
        assert!(get_logs()[0].starts_with("EVENT_JSON:{\"standard\":\"tally-proof\""), "an event is logged");
        assert!(get_logs()[0].contains("\"verdict\":\"Fake\""));
    }

    #[test]
    fn a_correction_is_added_on_top_and_the_first_verdict_stays() {
        let mut c = fresh();
        c.record(FP.into(), Verdict::Fake, "k3x9q2".into());
        as_account("tally.testnet", 5_000);
        let r = c.record(FP.into(), Verdict::Real, "k3x9q2-appeal".into());
        assert_eq!((r.entries, r.latest.verdict, r.latest.recorded_at_ms), (2, Verdict::Real, 5_000));
        let h = c.history(FP.into());
        assert_eq!(h.iter().map(|p| p.verdict).collect::<Vec<_>>(), vec![Verdict::Fake, Verdict::Real]);
        assert_eq!(h[0].recorded_at_ms, 1_000, "the first entry is untouched");
        assert_eq!(c.cards(), 1, "still one card");
    }

    #[test]
    fn each_card_has_its_own_record() {
        let mut c = fresh();
        c.record(FP.into(), Verdict::Fake, "a1".into());
        c.record(FP2.into(), Verdict::Real, "b2".into());
        assert_eq!(c.cards(), 2);
        assert_eq!(c.get(FP2.into()).unwrap().latest.verdict, Verdict::Real);
        assert_eq!(c.history("0".repeat(64)), vec![], "an unknown card has no history");
    }

    #[test]
    #[should_panic(expected = "Only Tally's attester can record a check")]
    fn nobody_else_can_record() {
        let mut c = fresh();
        as_account("someone.testnet", 2_000);
        c.record(FP.into(), Verdict::Real, "x".into());
    }

    #[test]
    #[should_panic(expected = "A fingerprint is 64 lower-case hex characters")]
    fn a_name_cant_be_stored_as_a_fingerprint() {
        let mut c = fresh();
        c.record("@some_trader".into(), Verdict::Fake, "x".into());
    }

    #[test]
    #[should_panic(expected = "A check id is 1 to 32 letters, digits, - or _")]
    fn a_link_or_a_handle_cant_be_stored_as_a_check_id() {
        let mut c = fresh();
        c.record(FP.into(), Verdict::Fake, "x.com/some_trader".into());
    }

    #[test]
    fn what_counts_as_a_check_id() {
        assert!(is_check_id("k3x9q2") && is_check_id("K3_x-9"));
        assert!(!is_check_id("") && !is_check_id(&"a".repeat(33)) && !is_check_id("a b") && !is_check_id("a\"b"));
    }
}
