//! What Tally's NEAR contracts share: what counts as a card's fingerprint, the verdicts, and a card's record as
//! the proof registry returns it. The registry (`contracts/proof`) stores these; the verified card
//! (`contracts/card`) reads them from the registry before it mints or keeps a card; the paid check
//! (`contracts/check`) reads them for an agent, and pays and rechecks verified cards.

use near_sdk::json_types::U128;
use near_sdk::{ext_contract, near, AccountId};

/// What Tally concluded about a card.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    /// The card held up: nothing wrong was found.
    Real,
    /// Something doesn't add up, but it isn't proven fake.
    Unclear,
    /// Proven fake: an earlier copy, numbers the chart rules out, an edited card.
    Fake,
}

/// One entry in a card's history.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Proof {
    pub verdict: Verdict,
    /// Tally's id for the check (tallypnl.com/check/<id>), where the evidence is shown.
    pub check_id: String,
    /// When NEAR recorded it, in milliseconds since 1970. Set by the chain, not by the caller.
    pub recorded_at_ms: u64,
}

/// A card's current verdict with how many times it has been recorded.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Record {
    pub fingerprint: String,
    pub latest: Proof,
    /// 1 for a card recorded once; more when a verdict was later corrected.
    pub entries: u32,
}

/// What to do about a card, from what the registry says of it. The answer an agent or a wallet acts on.
#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    /// Go ahead.
    Allow,
    /// Stop and ask the owner: nobody knows.
    Warn,
    /// Refuse.
    Block,
}

/// The rule, in one place: Real allows, Unclear warns, and Fake blocks. So does no record, and so does a registry
/// that didn't answer: pass `None` for both. Only Real is ever a yes. (The site's and the demo agent's copy of the
/// same table is `decide` in `web/scripts/agent-rule.mjs`.)
pub fn decide(record: Option<&Record>) -> Decision {
    match record.map(|r| r.latest.verdict) {
        Some(Verdict::Real) => Decision::Allow,
        Some(Verdict::Unclear) => Decision::Warn,
        Some(Verdict::Fake) | None => Decision::Block,
    }
}

/// What the proof registry answers to anyone, another contract included. The registry implements it, and the
/// verified card calls it through `proof_registry::ext(<registry account>)`.
#[ext_contract(proof_registry)]
pub trait ProofRegistry {
    /// A card's current verdict, or nothing when Tally has never recorded it.
    fn get(&self, fingerprint: String) -> Option<Record>;
}

/// A verified card as the paid check needs to see it: who holds it. The card contract answers with a whole NFT
/// token (NEP-171); the rest of it is ignored here.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Held {
    pub owner_id: AccountId,
}

/// What the paid check asks of the verified card contract, through `verified_cards::ext(<card contract>)`.
#[ext_contract(verified_cards)]
pub trait VerifiedCards {
    /// The verified card for a fingerprint, or nothing when the card has none.
    fn nft_token(&self, token_id: String) -> Option<Held>;
    /// Pays the attached NEAR into a verified card. Answers what the card holds now.
    fn earn(&mut self, fingerprint: String) -> U128;
    /// Asks the registry about a verified card again; it is burned if it's no longer Real.
    fn recheck(&mut self, fingerprint: String) -> bool;
}

const FINGERPRINT_LEN: usize = 64; // a SHA-256 hash in hex

/// A fingerprint is the SHA-256 hash of the card picture, in lower-case hex. Nothing else is accepted in its
/// place, so a name or a handle can't be stored as one.
pub fn is_fingerprint(s: &str) -> bool {
    s.len() == FINGERPRINT_LEN && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FP: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    #[test]
    fn what_counts_as_a_fingerprint() {
        assert!(is_fingerprint(FP));
        assert!(
            !is_fingerprint(&FP.to_uppercase()),
            "lower case only, so one card has one key"
        );
        assert!(!is_fingerprint(&FP[..63]));
        assert!(!is_fingerprint(&format!("{}g", &FP[..63])));
        assert!(!is_fingerprint("@some_trader"));
    }

    fn record(verdict: Verdict) -> Record {
        Record {
            fingerprint: FP.into(),
            latest: Proof {
                verdict,
                check_id: "k3x9q2".into(),
                recorded_at_ms: 1000,
            },
            entries: 1,
        }
    }

    #[test]
    fn real_is_allow() {
        assert_eq!(decide(Some(&record(Verdict::Real))), Decision::Allow);
    }

    #[test]
    fn unclear_is_warn() {
        assert_eq!(decide(Some(&record(Verdict::Unclear))), Decision::Warn);
    }

    #[test]
    fn fake_is_block() {
        assert_eq!(decide(Some(&record(Verdict::Fake))), Decision::Block);
    }

    #[test]
    fn no_record_or_no_answer_is_block() {
        assert_eq!(
            decide(None),
            Decision::Block,
            "a card nobody checked, or a registry that didn't answer, is never a yes"
        );
    }

    #[test]
    fn a_decision_reads_as_one_plain_word() {
        assert_eq!(near_sdk::serde_json::to_string(&Decision::Warn).unwrap(), r#""Warn""#);
    }

    #[test]
    fn a_verified_card_is_read_from_the_whole_token_the_card_contract_answers_with() {
        let json = format!(
            r#"{{"token_id":"{FP}","owner_id":"trader.testnet","metadata":{{"title":"Tally verified card 9f86d081","media":"badge/{FP}.png","extra":"{{}}"}},"approved_account_ids":null}}"#
        );
        let held: Held = near_sdk::serde_json::from_str(&json).unwrap();
        assert_eq!(held.owner_id.as_str(), "trader.testnet");
    }

    #[test]
    fn a_record_reads_the_same_json_the_registry_answers_with() {
        let json = format!(
            r#"{{"fingerprint":"{FP}","latest":{{"verdict":"Real","check_id":"k3x9q2","recorded_at_ms":1000}},"entries":2}}"#
        );
        let record: Record = near_sdk::serde_json::from_str(&json).unwrap();
        assert_eq!(
            record.latest,
            Proof {
                verdict: Verdict::Real,
                check_id: "k3x9q2".into(),
                recorded_at_ms: 1000
            }
        );
        assert_eq!(near_sdk::serde_json::to_string(&record).unwrap(), json);
    }
}
