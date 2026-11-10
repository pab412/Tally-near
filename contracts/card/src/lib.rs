//! Tally's verified card on NEAR.
//!
//! When Tally (tallypnl.com) checks a PnL card and finds it real, the trader can hold a verified card for it: an
//! NFT whose id is the card's fingerprint. It does three things an ordinary NFT doesn't:
//! - It can only be minted for a card the proof registry (`contracts/proof`) says is Real. This contract asks the
//!   registry itself, on-chain, before it mints; Tally's word alone isn't enough.
//! - It can't be transferred or sold. It belongs to the trader who earned it, so a verified card can't be bought.
//! - It answers to the registry for as long as it exists. Anyone can ask this contract to recheck a card, and if
//!   the registry's latest verdict is no longer Real, the verified card is burned on the spot.
//!
//! What is stored: the fingerprint, the NEAR account the trader chose to hold it, and the check it came from.
//! Never a name, a handle from another site, a wallet on another chain or the picture. The holder can burn their
//! own card at any time.

use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::events::{NftBurn, NftMint};
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, BorshStorageKey, Gas, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue,
};
use tally_types::{is_fingerprint, proof_registry, Record, Verdict};

/// A verified card as it is stored; its id is the card's fingerprint.
#[near(serializers = [borsh])]
struct Card {
    owner: AccountId,
    /// Tally's id for the check that found the card real (tallypnl.com/check/<id>).
    check_id: String,
    minted_at_ms: u64,
}

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Cards,
    Owners,
    Owned { owner: AccountId },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TallyCard {
    /// The only account that may mint: Tally's attester.
    attester: AccountId,
    /// The proof registry this contract asks before it mints or keeps a card.
    registry: AccountId,
    cards: IterableMap<String, Card>,
    owned: LookupMap<AccountId, IterableSet<String>>,
}

const GAS_FOR_REGISTRY: Gas = Gas::from_tgas(5);
const GAS_FOR_ANSWER: Gas = Gas::from_tgas(10);
const PAGE: u64 = 50;

const NOT_TRANSFERABLE: &str = "A verified card can't be transferred: it stays with the trader who earned it";
const NO_ANSWER: &str = "The proof registry didn't answer, so nothing was changed";
const ALREADY_MINTED: &str = "This card already has its verified card";

#[near]
impl TallyCard {
    #[init]
    pub fn new(attester: AccountId, registry: AccountId) -> Self {
        Self { attester, registry, cards: IterableMap::new(Key::Cards), owned: LookupMap::new(Key::Owners) }
    }

    /// Mints the verified card for `fingerprint` to `owner`. Attester only, and only once the proof registry has
    /// answered that its latest verdict for this card is Real.
    pub fn mint(&mut self, fingerprint: String, owner: AccountId) -> Promise {
        require!(env::predecessor_account_id() == self.attester, "Only Tally's attester can mint a verified card");
        require!(is_fingerprint(&fingerprint), "A fingerprint is 64 lower-case hex characters");
        require!(!self.cards.contains_key(&fingerprint), ALREADY_MINTED);
        self.ask_registry(&fingerprint)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_ANSWER).on_mint_checked(fingerprint, owner))
    }

    /// The registry's answer to `mint`. Only this contract can call it.
    #[private]
    pub fn on_mint_checked(
        &mut self,
        fingerprint: String,
        owner: AccountId,
        #[callback_result] record: Result<Option<Record>, PromiseError>,
    ) -> Token {
        let proof = match record {
            Err(_) => env::panic_str(NO_ANSWER),
            Ok(None) => env::panic_str("Tally hasn't checked this card, so it can't be verified"),
            Ok(Some(record)) => record.latest,
        };
        require!(proof.verdict == Verdict::Real, "Only a card the proof registry says is Real can be verified");
        require!(!self.cards.contains_key(&fingerprint), ALREADY_MINTED);

        let card = Card { owner: owner.clone(), check_id: proof.check_id, minted_at_ms: env::block_timestamp_ms() };
        self.cards.insert(fingerprint.clone(), card);
        if !self.owned.contains_key(&owner) {
            self.owned.insert(owner.clone(), IterableSet::new(Key::Owned { owner: owner.clone() }));
        }
        self.owned.get_mut(&owner).unwrap().insert(fingerprint.clone());

        NftMint { owner_id: &owner, token_ids: &[&fingerprint], memo: None }.emit();
        self.token(&fingerprint).unwrap()
    }

    /// Asks the proof registry about a verified card again. Anyone can call it. The card is burned if the registry's
    /// latest verdict is no longer Real. Answers whether the card still stands.
    pub fn recheck(&mut self, fingerprint: String) -> Promise {
        require!(self.cards.contains_key(&fingerprint), "There is no verified card for this fingerprint");
        self.ask_registry(&fingerprint)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_ANSWER).on_rechecked(fingerprint))
    }

    /// The registry's answer to `recheck`. Only this contract can call it.
    #[private]
    pub fn on_rechecked(
        &mut self,
        fingerprint: String,
        #[callback_result] record: Result<Option<Record>, PromiseError>,
    ) -> bool {
        let Ok(record) = record else { env::panic_str(NO_ANSWER) };
        if record.is_some_and(|r| r.latest.verdict == Verdict::Real) {
            return true;
        }
        if let Some(owner) = self.remove(&fingerprint) {
            let memo = Some("The proof registry no longer says this card is Real");
            NftBurn { owner_id: &owner, token_ids: &[&fingerprint], authorized_id: None, memo }.emit();
        }
        false
    }

    /// The holder gives their verified card up. Needs 1 yoctoNEAR attached, so only a full-access key can do it.
    #[payable]
    pub fn burn(&mut self, token_id: TokenId) {
        assert_one_yocto();
        let holder = self.cards.get(&token_id).map(|card| card.owner.clone());
        require!(holder == Some(env::predecessor_account_id()), "Only the holder can burn their verified card");
        let owner = self.remove(&token_id).unwrap();
        NftBurn { owner_id: &owner, token_ids: &[&token_id], authorized_id: None, memo: Some("Burned by its holder") }.emit();
    }

    pub fn attester(&self) -> AccountId {
        self.attester.clone()
    }

    pub fn registry(&self) -> AccountId {
        self.registry.clone()
    }
}

impl TallyCard {
    fn ask_registry(&self, fingerprint: &str) -> Promise {
        proof_registry::ext(self.registry.clone()).with_static_gas(GAS_FOR_REGISTRY).get(fingerprint.to_string())
    }

    /// Takes a verified card out of the contract and answers who held it.
    fn remove(&mut self, fingerprint: &str) -> Option<AccountId> {
        let card = self.cards.remove(fingerprint)?;
        let held = self.owned.get_mut(&card.owner).unwrap();
        held.remove(fingerprint);
        if held.is_empty() {
            self.owned.remove(&card.owner);
        }
        Some(card.owner)
    }

    /// A verified card the way the NFT standard (NEP-171 with NEP-177 metadata) shows it.
    fn token(&self, fingerprint: &str) -> Option<Token> {
        let card = self.cards.get(fingerprint)?;
        Some(Token {
            token_id: fingerprint.to_string(),
            owner_id: card.owner.clone(),
            metadata: Some(TokenMetadata {
                title: Some(format!("Tally verified card {}", &fingerprint[..8])),
                description: Some(
                    "Tally checked this PnL card and found it real. It can't be transferred, and it is burned if the verdict is ever corrected."
                        .to_string(),
                ),
                copies: Some(1),
                issued_at: Some(card.minted_at_ms.to_string()),
                // check ids and account ids are plain letters, digits, - _ and dots, so this is always valid JSON
                extra: Some(format!(r#"{{"check_id":"{}","registry":"{}"}}"#, card.check_id, self.registry)),
                ..Default::default()
            }),
            approved_account_ids: None,
        })
    }

    fn page<'a>(&'a self, ids: impl Iterator<Item = &'a String> + 'a, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        let skip = usize::try_from(from_index.map_or(0, |i| i.0)).unwrap_or(usize::MAX);
        ids.skip(skip).take(limit.unwrap_or(PAGE).min(PAGE) as usize).filter_map(|id| self.token(id)).collect()
    }
}

#[near]
impl NonFungibleTokenCore for TallyCard {
    // The argument names are the standard's, so a wallet's transfer reaches the message below, not a parsing error.
    #[payable]
    #[allow(unused_variables)]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        env::panic_str(NOT_TRANSFERABLE)
    }

    #[payable]
    #[allow(unused_variables)]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        env::panic_str(NOT_TRANSFERABLE)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.token(&token_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for TallyCard {
    fn nft_total_supply(&self) -> U128 {
        U128(self.cards.len().into())
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.page(self.cards.keys(), from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(self.owned.get(&account_id).map_or(0, |held| held.len()).into())
    }

    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.owned.get(&account_id).map(|held| self.page(held.iter(), from_index, limit)).unwrap_or_default()
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for TallyCard {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Tally verified card".to_string(),
            symbol: "TALLY".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::{testing_env, NearToken};
    use tally_types::Proof;

    const FP: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const FP2: &str = "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";
    const FP3: &str = "fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9";
    const TALLY: &str = "tally.testnet";
    const CARD: &str = "card.tally.testnet";
    const TRADER: &str = "trader.testnet";

    fn id(who: &str) -> AccountId {
        who.parse().unwrap()
    }

    /// Who is calling, when, and with how many yoctoNEAR attached. The contract itself is always CARD.
    fn as_account(who: &str, at_ms: u64, yocto: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(id(CARD))
            .predecessor_account_id(id(who))
            .block_timestamp(at_ms * 1_000_000)
            .attached_deposit(NearToken::from_yoctonear(yocto))
            .build());
    }

    fn fresh() -> TallyCard {
        as_account(TALLY, 1_000, 0);
        TallyCard::new(id(TALLY), id("proof.tally.testnet"))
    }

    /// What the registry answers for a card whose latest verdict is `verdict`.
    fn says(verdict: Verdict) -> Result<Option<Record>, PromiseError> {
        let latest = Proof { verdict, check_id: "k3x9q2".into(), recorded_at_ms: 500 };
        Ok(Some(Record { fingerprint: FP.into(), latest, entries: 1 }))
    }

    /// Mints the way the chain does: the attester asks, then the contract receives the registry's answer.
    fn minted(c: &mut TallyCard, fingerprint: &str, owner: &str) -> Token {
        as_account(TALLY, 2_000, 0);
        let _ = c.mint(fingerprint.into(), id(owner));
        as_account(CARD, 2_000, 0);
        c.on_mint_checked(fingerprint.into(), id(owner), says(Verdict::Real))
    }

    fn supply(c: &TallyCard) -> u128 {
        c.nft_total_supply().0
    }

    #[test]
    fn a_card_the_registry_says_is_real_becomes_a_verified_card() {
        let mut c = fresh();
        assert_eq!(c.nft_token(FP.into()), None);
        let token = minted(&mut c, FP, TRADER);
        assert_eq!((token.token_id.as_str(), token.owner_id.as_str()), (FP, TRADER));
        let meta = token.metadata.clone().unwrap();
        assert_eq!(meta.title.as_deref(), Some("Tally verified card 9f86d081"));
        assert_eq!(meta.issued_at.as_deref(), Some("2000"), "the chain's own time");
        assert_eq!(meta.extra.as_deref(), Some(r#"{"check_id":"k3x9q2","registry":"proof.tally.testnet"}"#));
        assert_eq!(c.nft_token(FP.into()), Some(token.clone()));
        assert_eq!((supply(&c), c.nft_supply_for_owner(id(TRADER)).0), (1, 1));
        assert_eq!(c.nft_tokens_for_owner(id(TRADER), None, None), vec![token]);
        let log = get_logs().join("\n");
        assert!(log.contains(r#""standard":"nep171""#) && log.contains(r#""event":"nft_mint""#), "the standard mint event: {log}");
    }

    #[test]
    #[should_panic(expected = "Only a card the proof registry says is Real can be verified")]
    fn a_fake_card_cant_be_verified() {
        let mut c = fresh();
        as_account(CARD, 2_000, 0);
        c.on_mint_checked(FP.into(), id(TRADER), says(Verdict::Fake));
    }

    #[test]
    #[should_panic(expected = "Only a card the proof registry says is Real can be verified")]
    fn an_unclear_card_cant_be_verified() {
        let mut c = fresh();
        as_account(CARD, 2_000, 0);
        c.on_mint_checked(FP.into(), id(TRADER), says(Verdict::Unclear));
    }

    #[test]
    #[should_panic(expected = "Tally hasn't checked this card, so it can't be verified")]
    fn a_card_tally_never_checked_cant_be_verified() {
        let mut c = fresh();
        as_account(CARD, 2_000, 0);
        c.on_mint_checked(FP.into(), id(TRADER), Ok(None));
    }

    #[test]
    #[should_panic(expected = "The proof registry didn't answer, so nothing was changed")]
    fn nothing_is_minted_when_the_registry_doesnt_answer() {
        let mut c = fresh();
        as_account(CARD, 2_000, 0);
        c.on_mint_checked(FP.into(), id(TRADER), Err(PromiseError::Failed));
    }

    #[test]
    #[should_panic(expected = "Only Tally's attester can mint a verified card")]
    fn nobody_else_can_mint() {
        let mut c = fresh();
        as_account(TRADER, 2_000, 0);
        let _ = c.mint(FP.into(), id(TRADER));
    }

    #[test]
    #[should_panic(expected = "A fingerprint is 64 lower-case hex characters")]
    fn a_name_cant_be_minted_as_a_card() {
        let mut c = fresh();
        let _ = c.mint("@some_trader".into(), id(TRADER));
    }

    #[test]
    #[should_panic(expected = "This card already has its verified card")]
    fn a_card_has_one_verified_card() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        as_account(TALLY, 3_000, 0);
        let _ = c.mint(FP.into(), id("someone-else.testnet"));
    }

    #[test]
    #[should_panic(expected = "A verified card can't be transferred")]
    fn a_verified_card_cant_be_transferred() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        as_account(TRADER, 3_000, 1);
        c.nft_transfer(id("buyer.testnet"), FP.into(), None, None);
    }

    #[test]
    #[should_panic(expected = "A verified card can't be transferred")]
    fn a_verified_card_cant_be_sent_to_a_marketplace_either() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        as_account(TRADER, 3_000, 1);
        let _ = c.nft_transfer_call(id("market.testnet"), FP.into(), None, None, "list".into());
    }

    #[test]
    fn a_recheck_keeps_a_real_card_and_burns_one_whose_verdict_was_corrected() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        minted(&mut c, FP2, TRADER);

        as_account("anyone.testnet", 3_000, 0);
        let _ = c.recheck(FP.into()); // anyone may ask
        as_account(CARD, 3_000, 0);
        assert!(c.on_rechecked(FP.into(), says(Verdict::Real)), "still Real: the card stands");
        assert_eq!(supply(&c), 2);

        assert!(!c.on_rechecked(FP.into(), says(Verdict::Fake)), "corrected to Fake: the card is gone");
        assert_eq!(c.nft_token(FP.into()), None);
        assert_eq!((supply(&c), c.nft_supply_for_owner(id(TRADER)).0), (1, 1));
        assert_eq!(c.nft_tokens_for_owner(id(TRADER), None, None)[0].token_id, FP2, "their other card is untouched");
        let log = get_logs().join("\n");
        assert!(log.contains(r#""event":"nft_burn""#) && log.contains("no longer says this card is Real"), "{log}");

        assert!(!c.on_rechecked(FP2.into(), says(Verdict::Unclear)), "Unclear isn't Real either");
        assert_eq!((supply(&c), c.nft_supply_for_owner(id(TRADER)).0), (0, 0));
        assert_eq!(c.nft_tokens_for_owner(id(TRADER), None, None), vec![]);
    }

    #[test]
    fn a_card_burned_after_a_correction_can_be_minted_again_once_its_real_again() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        as_account(CARD, 3_000, 0);
        assert!(!c.on_rechecked(FP.into(), says(Verdict::Fake)));
        assert_eq!(minted(&mut c, FP, TRADER).owner_id, id(TRADER));
        assert_eq!(supply(&c), 1);
    }

    #[test]
    #[should_panic(expected = "The proof registry didn't answer, so nothing was changed")]
    fn a_recheck_that_gets_no_answer_burns_nothing() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        as_account(CARD, 3_000, 0);
        c.on_rechecked(FP.into(), Err(PromiseError::Failed));
    }

    #[test]
    #[should_panic(expected = "There is no verified card for this fingerprint")]
    fn only_a_verified_card_can_be_rechecked() {
        let mut c = fresh();
        let _ = c.recheck(FP.into());
    }

    #[test]
    fn the_holder_can_burn_their_own_card() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        as_account(TRADER, 3_000, 1);
        c.burn(FP.into());
        assert_eq!((c.nft_token(FP.into()), supply(&c)), (None, 0));
        assert!(get_logs().join("\n").contains("Burned by its holder"));
    }

    #[test]
    #[should_panic(expected = "Only the holder can burn their verified card")]
    fn nobody_else_can_burn_a_card_not_even_tally() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        as_account(TALLY, 3_000, 1);
        c.burn(FP.into());
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn a_burn_needs_the_holders_full_key() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        as_account(TRADER, 3_000, 0);
        c.burn(FP.into());
    }

    #[test]
    fn cards_are_listed_in_pages_for_everyone_and_per_holder() {
        let mut c = fresh();
        minted(&mut c, FP, TRADER);
        minted(&mut c, FP2, "other.testnet");
        minted(&mut c, FP3, TRADER);
        let ids = |tokens: Vec<Token>| tokens.into_iter().map(|t| t.token_id).collect::<Vec<_>>();
        assert_eq!(ids(c.nft_tokens(None, None)), vec![FP, FP2, FP3]);
        assert_eq!(ids(c.nft_tokens(Some(U128(1)), Some(1))), vec![FP2]);
        assert_eq!(ids(c.nft_tokens(Some(U128(9)), None)), Vec::<String>::new());
        assert_eq!(ids(c.nft_tokens_for_owner(id(TRADER), None, None)), vec![FP, FP3]);
        assert_eq!(ids(c.nft_tokens_for_owner(id(TRADER), Some(U128(1)), Some(5))), vec![FP3]);
        assert_eq!(c.nft_supply_for_owner(id("nobody.testnet")).0, 0);
        assert_eq!(c.nft_tokens_for_owner(id("nobody.testnet"), None, None), vec![]);
        assert_eq!(c.nft_metadata().spec, "nft-1.0.0");
    }
}
