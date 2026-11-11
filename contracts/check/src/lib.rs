//! Tally's paid check on NEAR.
//!
//! An AI agent that follows calls or copies trades asks this contract whether a PnL card is real, and pays a small
//! fee for the answer. The contract asks the proof registry (`contracts/proof`) on-chain, in the same call, so the
//! answer is the registry's and nobody in the middle can change it.
//!
//! - **The agent has a spending limit.** It never holds money it could spend elsewhere. Its owner loads credit here
//!   (`deposit`), and each answered check takes the fee from that credit. The agent itself works with a NEAR
//!   function-call key that can only call `check` on this contract, so the most it can ever spend is the credit its
//!   owner loaded, and the owner takes back what's left with `refund`.
//! - **No answer, no charge.** A card the registry has never recorded costs nothing, and neither does a check the
//!   registry couldn't answer.
//! - **The trader earns.** When the card is Real and has a verified card (`contracts/card`), a share of the fee is
//!   paid into that verified card.
//! - **A corrected card is caught.** When a card still has a verified card but the registry no longer says Real,
//!   this contract asks the card contract to recheck it, which burns it with whatever it held.
//!
//! What is stored: each account's credit, and the contract's own share of the fees. Never a name or a handle.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError};
use tally_types::{is_fingerprint, proof_registry, verified_cards, Held, Record, Verdict};

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Credit,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TallyCheck {
    /// Who may collect the contract's own share of the fees: Tally.
    owner: AccountId,
    /// The proof registry every answer comes from.
    registry: AccountId,
    /// The verified card contract: who holds a card's verified card, and where the trader's share is paid.
    cards: AccountId,
    /// What one answered check costs, in yoctoNEAR.
    fee: u128,
    /// The share of the fee paid into the card's verified card, in percent.
    trader_percent: u8,
    /// What each account has left to spend on checks, in yoctoNEAR.
    credit: LookupMap<AccountId, u128>,
    /// The contract's own share of the fees, not yet collected, in yoctoNEAR.
    takings: u128,
    /// How many checks were answered and charged.
    checks: u64,
}

/// What a check answers.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Answer {
    /// The card's record, exactly as the registry gives it to anyone. Nothing when Tally has never checked the card.
    pub record: Option<Record>,
    /// The account holding this card's verified card, when the card is Real and has one.
    pub held_by: Option<AccountId>,
    /// What this check cost, in yoctoNEAR. Nothing when there was no record.
    pub charged: U128,
    /// The part of the fee paid into the trader's verified card, in yoctoNEAR.
    pub to_trader: U128,
}

/// What a check costs and where it looks, for anyone deciding whether to use it.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Terms {
    pub fee: U128,
    pub trader_percent: u8,
    pub registry: AccountId,
    pub cards: AccountId,
    /// How many checks have been answered and charged so far.
    pub checks: u64,
}

const GAS_FOR_READING: Gas = Gas::from_tgas(5);
// the answer hands some of its gas on: 10 Tgas to pay a verified card, or 30 to have a corrected one burned
const GAS_FOR_ANSWER: Gas = Gas::from_tgas(45);
const GAS_FOR_PAYING: Gas = Gas::from_tgas(5);
const GAS_FOR_RECHECK: Gas = Gas::from_tgas(30);
const GAS_FOR_SETTLING: Gas = Gas::from_tgas(5);

const NOT_A_FINGERPRINT: &str = "A fingerprint is 64 lower-case hex characters";
const NO_CREDIT: &str = "Not enough credit for a check: the account's owner has to load more";
const NO_ANSWER: &str = "The proof registry didn't answer, so nothing was charged";

#[near]
impl TallyCheck {
    /// `fee` is in yoctoNEAR; `trader_percent` of it goes to the card's verified card.
    #[init]
    pub fn new(owner: AccountId, registry: AccountId, cards: AccountId, fee: U128, trader_percent: u8) -> Self {
        require!(fee.0 > 0, "A check has to cost something");
        require!(trader_percent <= 100, "The trader's share is a percentage, at most 100");
        Self { owner, registry, cards, fee: fee.0, trader_percent, credit: LookupMap::new(Key::Credit), takings: 0, checks: 0 }
    }

    /// Loads the attached NEAR as credit for `account_id` (or for the caller). This is how an agent's owner sets
    /// what the agent may spend. Answers the account's credit now.
    #[payable]
    pub fn deposit(&mut self, account_id: Option<AccountId>) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        // an account's credit takes storage here; at least one fee keeps that from being used to fill the contract
        require!(amount >= self.fee, "Load at least the price of one check");
        let account = account_id.unwrap_or_else(env::predecessor_account_id);
        let credit = self.left(&account) + amount;
        self.credit.insert(account, credit);
        U128(credit)
    }

    /// Asks whether a card is real. The fee is taken from the caller's credit once there is an answer to give.
    pub fn check(&self, fingerprint: String) -> Promise {
        require!(is_fingerprint(&fingerprint), NOT_A_FINGERPRINT);
        let agent = env::predecessor_account_id();
        require!(self.left(&agent) >= self.fee, NO_CREDIT);
        proof_registry::ext(self.registry.clone())
            .with_static_gas(GAS_FOR_READING)
            .get(fingerprint.clone())
            .and(verified_cards::ext(self.cards.clone()).with_static_gas(GAS_FOR_READING).nft_token(fingerprint.clone()))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_ANSWER).on_checked(agent, fingerprint))
    }

    /// The registry's and the card contract's answers to `check`. Only this contract can call it.
    #[private]
    pub fn on_checked(
        &mut self,
        agent: AccountId,
        fingerprint: String,
        #[callback_result] record: Result<Option<Record>, PromiseError>,
        #[callback_result] card: Result<Option<Held>, PromiseError>,
    ) -> Answer {
        let Ok(record) = record else { env::panic_str(NO_ANSWER) };
        let Some(record) = record else {
            return Answer { record: None, held_by: None, charged: U128(0), to_trader: U128(0) };
        };

        // charged on delivery; the credit is looked at again because other checks may have used it meanwhile
        let left = self.left(&agent);
        require!(left >= self.fee, NO_CREDIT);
        self.credit.insert(agent.clone(), left - self.fee);
        self.checks += 1;

        // a card contract that couldn't be read counts as no verified card: the agent still gets the verdict
        let holder = card.ok().flatten().map(|held| held.owner_id);
        let real = record.latest.verdict == Verdict::Real;
        let cards = || verified_cards::ext(self.cards.clone());
        let mut to_trader = 0;
        if holder.is_some() && real {
            to_trader = self.fee * u128::from(self.trader_percent) / 100;
            if to_trader > 0 {
                cards()
                    .with_static_gas(GAS_FOR_PAYING)
                    .with_attached_deposit(NearToken::from_yoctonear(to_trader))
                    .earn(fingerprint.clone())
                    .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_SETTLING).on_trader_paid(U128(to_trader)))
                    .detach();
            }
        } else if holder.is_some() {
            // the verdict was corrected but the verified card is still there: have it burned
            cards().with_static_gas(GAS_FOR_RECHECK).recheck(fingerprint.clone()).detach();
        }
        self.takings += self.fee - to_trader;

        env::log_str(&format!(
            r#"EVENT_JSON:{{"standard":"tally_check","version":"1.0.0","event":"checked","data":[{{"agent":"{agent}","fingerprint":"{fingerprint}","verdict":"{:?}","charged":"{}","to_trader":"{to_trader}"}}]}}"#,
            record.latest.verdict, self.fee
        ));
        Answer { record: Some(record), held_by: holder.filter(|_| real), charged: U128(self.fee), to_trader: U128(to_trader) }
    }

    /// Whether the trader's share reached the verified card. Only this contract can call it. If it didn't (the card
    /// was burned in the same moment), NEAR has returned the money here and it joins the contract's own share.
    #[private]
    pub fn on_trader_paid(&mut self, amount: U128, #[callback_result] paid: Result<U128, PromiseError>) {
        if paid.is_err() {
            self.takings += amount.0;
        }
    }

    /// Sends the caller's unspent credit back to them.
    pub fn refund(&mut self) -> Promise {
        let account = env::predecessor_account_id();
        let credit = self.credit.remove(&account).unwrap_or(0);
        require!(credit > 0, "There is no credit to send back");
        Promise::new(account.clone())
            .transfer(NearToken::from_yoctonear(credit))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_SETTLING).on_refunded(account, U128(credit)))
    }

    /// Whether the refund arrived. Only this contract can call it. If it didn't, the credit is put back.
    #[private]
    pub fn on_refunded(&mut self, account_id: AccountId, amount: U128, #[callback_result] sent: Result<(), PromiseError>) -> U128 {
        if sent.is_ok() {
            return amount;
        }
        let credit = self.left(&account_id) + amount.0;
        self.credit.insert(account_id, credit);
        U128(0)
    }

    /// Sends the contract's own share of the fees to its owner. Credit that accounts loaded is never part of it.
    pub fn collect(&mut self) -> Promise {
        require!(env::predecessor_account_id() == self.owner, "Only the owner can collect the contract's share");
        let amount = std::mem::take(&mut self.takings);
        require!(amount > 0, "There is nothing to collect yet");
        Promise::new(self.owner.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_SETTLING).on_collected(U128(amount)))
    }

    /// Whether the owner's share arrived. Only this contract can call it. If it didn't, it is put back.
    #[private]
    pub fn on_collected(&mut self, amount: U128, #[callback_result] sent: Result<(), PromiseError>) -> U128 {
        if sent.is_ok() {
            return amount;
        }
        self.takings += amount.0;
        U128(0)
    }

    /// What an account has left to spend on checks, in yoctoNEAR.
    pub fn credit_of(&self, account_id: AccountId) -> U128 {
        U128(self.left(&account_id))
    }

    pub fn terms(&self) -> Terms {
        Terms {
            fee: U128(self.fee),
            trader_percent: self.trader_percent,
            registry: self.registry.clone(),
            cards: self.cards.clone(),
            checks: self.checks,
        }
    }

    /// The contract's own share of the fees that its owner hasn't collected yet, in yoctoNEAR.
    pub fn takings(&self) -> U128 {
        U128(self.takings)
    }
}

impl TallyCheck {
    fn left(&self, account: &AccountId) -> u128 {
        self.credit.get(account).copied().unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
    use near_sdk::testing_env;
    use tally_types::Proof;

    const FP: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const TALLY: &str = "tally.testnet";
    const DESK: &str = "check.tally.testnet";
    const CARDS: &str = "card.tally.testnet";
    const OWNER: &str = "fund.testnet";
    const AGENT: &str = "agent.fund.testnet";
    const TRADER: &str = "trader.testnet";
    const FEE: u128 = 1_000;

    fn id(who: &str) -> AccountId {
        who.parse().unwrap()
    }

    /// Who is calling, with how many yoctoNEAR attached. The contract itself is always DESK.
    fn as_account(who: &str, yocto: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(id(DESK))
            .predecessor_account_id(id(who))
            .attached_deposit(NearToken::from_yoctonear(yocto))
            .build());
    }

    /// A check that costs 1,000 and pays 40% of it to the trader, with 2,500 of credit loaded for the agent.
    fn open() -> TallyCheck {
        as_account(TALLY, 0);
        let mut c = TallyCheck::new(id(TALLY), id("proof.tally.testnet"), id(CARDS), U128(FEE), 40);
        as_account(OWNER, 2_500);
        assert_eq!(c.deposit(Some(id(AGENT))).0, 2_500);
        c
    }

    /// What the registry answers for a card whose latest verdict is `verdict`.
    fn says(verdict: Verdict) -> Result<Option<Record>, PromiseError> {
        let latest = Proof { verdict, check_id: "k3x9q2".into(), recorded_at_ms: 500 };
        Ok(Some(Record { fingerprint: FP.into(), latest, entries: 1 }))
    }

    fn held() -> Result<Option<Held>, PromiseError> {
        Ok(Some(Held { owner_id: id(TRADER) }))
    }

    /// The agent asks, then the contract receives both answers.
    fn checked(c: &mut TallyCheck, record: Result<Option<Record>, PromiseError>, card: Result<Option<Held>, PromiseError>) -> Answer {
        as_account(AGENT, 0);
        let _ = c.check(FP.into());
        as_account(DESK, 0);
        c.on_checked(id(AGENT), FP.into(), record, card)
    }

    /// The calls this contract sent to the card contract in the last step: method name and yoctoNEAR attached.
    fn sent_to_cards() -> Vec<(String, u128)> {
        get_created_receipts()
            .into_iter()
            .filter(|receipt| receipt.receiver_id.as_str() == CARDS)
            .flat_map(|receipt| receipt.actions)
            .filter_map(|action| match action {
                near_sdk::mock::MockAction::FunctionCallWeight { method_name, attached_deposit, .. } => {
                    Some((String::from_utf8(method_name).unwrap(), attached_deposit.as_yoctonear()))
                }
                _ => None,
            })
            .collect()
    }

    fn credit(c: &TallyCheck) -> u128 {
        c.credit_of(id(AGENT)).0
    }

    #[test]
    fn a_real_card_with_a_verified_card_pays_its_trader_a_share() {
        let mut c = open();
        let answer = checked(&mut c, says(Verdict::Real), held());
        assert_eq!(answer.record.unwrap().latest.verdict, Verdict::Real);
        assert_eq!(answer.held_by, Some(id(TRADER)));
        assert_eq!((answer.charged.0, answer.to_trader.0), (FEE, 400));
        assert_eq!(sent_to_cards(), vec![("earn".to_string(), 400)], "the share goes into the verified card itself");
        assert_eq!((credit(&c), c.takings().0, c.terms().checks), (1_500, 600, 1));
        assert!(get_logs().join("\n").contains(r#""event":"checked""#));
    }

    #[test]
    fn a_fake_card_costs_the_same_and_pays_no_trader() {
        let mut c = open();
        let answer = checked(&mut c, says(Verdict::Fake), Ok(None));
        assert_eq!(answer.record.unwrap().latest.verdict, Verdict::Fake);
        assert_eq!((answer.held_by, answer.charged.0, answer.to_trader.0), (None, FEE, 0));
        assert_eq!(sent_to_cards(), vec![]);
        assert_eq!((credit(&c), c.takings().0), (1_500, FEE));
    }

    #[test]
    fn a_real_card_without_a_verified_card_pays_no_trader() {
        let mut c = open();
        let answer = checked(&mut c, says(Verdict::Real), Ok(None));
        assert_eq!((answer.held_by, answer.to_trader.0, c.takings().0), (None, 0, FEE));
    }

    #[test]
    fn a_corrected_card_that_still_has_its_verified_card_is_sent_to_be_burned() {
        let mut c = open();
        let answer = checked(&mut c, says(Verdict::Fake), held());
        assert_eq!((answer.held_by, answer.to_trader.0), (None, 0), "it pays nothing and isn't shown as verified");
        assert_eq!(sent_to_cards(), vec![("recheck".to_string(), 0)]);
    }

    #[test]
    fn a_card_tally_never_checked_costs_nothing() {
        let mut c = open();
        let answer = checked(&mut c, Ok(None), Ok(None));
        assert_eq!(answer, Answer { record: None, held_by: None, charged: U128(0), to_trader: U128(0) });
        assert_eq!((credit(&c), c.takings().0, c.terms().checks), (2_500, 0, 0));
    }

    #[test]
    #[should_panic(expected = "The proof registry didn't answer, so nothing was charged")]
    fn a_check_the_registry_didnt_answer_costs_nothing() {
        let mut c = open();
        checked(&mut c, Err(PromiseError::Failed), Ok(None));
    }

    #[test]
    fn a_card_contract_that_cant_be_read_doesnt_stop_the_answer() {
        let mut c = open();
        let answer = checked(&mut c, says(Verdict::Real), Err(PromiseError::Failed));
        assert_eq!((answer.charged.0, answer.to_trader.0, answer.held_by), (FEE, 0, None));
    }

    #[test]
    fn an_agent_can_spend_its_credit_and_not_a_yocto_more() {
        let mut c = open();
        checked(&mut c, says(Verdict::Fake), Ok(None));
        checked(&mut c, says(Verdict::Fake), Ok(None));
        assert_eq!(credit(&c), 500, "two checks out of 2,500");
        as_account(AGENT, 0);
        let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.check(FP.into()).detach()));
        assert!(refused.is_err(), "a third check is refused before the registry is asked");
        assert_eq!((credit(&c), c.takings().0), (500, 2 * FEE));
    }

    #[test]
    #[should_panic(expected = "Not enough credit for a check")]
    fn credit_used_up_while_the_registry_was_asked_buys_no_answer() {
        let mut c = open();
        as_account(AGENT, 0);
        let _ = c.check(FP.into());
        let _ = c.check(FP.into());
        let _ = c.check(FP.into()); // all three were allowed to ask, and 2,500 covers two
        as_account(DESK, 0);
        c.on_checked(id(AGENT), FP.into(), says(Verdict::Fake), Ok(None));
        c.on_checked(id(AGENT), FP.into(), says(Verdict::Fake), Ok(None));
        c.on_checked(id(AGENT), FP.into(), says(Verdict::Fake), Ok(None));
    }

    #[test]
    #[should_panic(expected = "Not enough credit for a check")]
    fn an_account_nobody_loaded_cant_check() {
        let c = open();
        as_account(TRADER, 0);
        let _ = c.check(FP.into());
    }

    #[test]
    #[should_panic(expected = "A fingerprint is 64 lower-case hex characters")]
    fn a_name_cant_be_checked_in_place_of_a_card() {
        let c = open();
        as_account(AGENT, 0);
        let _ = c.check("@some_trader".into());
    }

    #[test]
    fn credit_is_loaded_for_oneself_or_for_an_agent_and_adds_up() {
        let mut c = open();
        as_account(OWNER, 1_000);
        assert_eq!(c.deposit(Some(id(AGENT))).0, 3_500);
        assert_eq!(c.deposit(None).0, 1_000, "with no account named, the caller's own");
        assert_eq!(c.credit_of(id(TRADER)).0, 0);
    }

    #[test]
    #[should_panic(expected = "Load at least the price of one check")]
    fn less_than_one_check_cant_be_loaded() {
        let mut c = open();
        as_account(OWNER, FEE - 1);
        c.deposit(None);
    }

    #[test]
    fn unspent_credit_goes_back_to_whoever_holds_it() {
        let mut c = open();
        checked(&mut c, says(Verdict::Fake), Ok(None));
        as_account(AGENT, 0);
        let _ = c.refund();
        assert_eq!(credit(&c), 0, "the credit is gone before the money leaves");
        as_account(DESK, 0);
        assert_eq!(c.on_refunded(id(AGENT), U128(1_500), Ok(())).0, 1_500);
        assert_eq!(c.takings().0, FEE, "the contract's share is untouched");
    }

    #[test]
    fn a_refund_that_couldnt_be_delivered_is_put_back() {
        let mut c = open();
        as_account(AGENT, 0);
        let _ = c.refund();
        as_account(DESK, 0);
        assert_eq!(c.on_refunded(id(AGENT), U128(2_500), Err(PromiseError::Failed)).0, 0);
        assert_eq!(credit(&c), 2_500);
    }

    #[test]
    #[should_panic(expected = "There is no credit to send back")]
    fn theres_nothing_to_refund_to_an_account_with_no_credit() {
        let mut c = open();
        as_account(TRADER, 0);
        let _ = c.refund();
    }

    #[test]
    fn the_owner_collects_the_contracts_share_and_never_anyones_credit() {
        let mut c = open();
        checked(&mut c, says(Verdict::Real), held());
        as_account(TALLY, 0);
        let _ = c.collect();
        assert_eq!((c.takings().0, credit(&c)), (0, 1_500));
        as_account(DESK, 0);
        assert_eq!(c.on_collected(U128(600), Ok(())).0, 600);
        assert_eq!(c.on_collected(U128(600), Err(PromiseError::Failed)).0, 0);
        assert_eq!(c.takings().0, 600, "a share that couldn't be delivered is put back");
    }

    #[test]
    #[should_panic(expected = "Only the owner can collect the contract's share")]
    fn nobody_else_can_collect() {
        let mut c = open();
        checked(&mut c, says(Verdict::Fake), Ok(None));
        as_account(AGENT, 0);
        let _ = c.collect();
    }

    #[test]
    fn a_share_the_verified_card_didnt_take_stays_with_the_contract() {
        let mut c = open();
        checked(&mut c, says(Verdict::Real), held());
        as_account(DESK, 0);
        c.on_trader_paid(U128(400), Ok(U128(400)));
        assert_eq!(c.takings().0, 600);
        c.on_trader_paid(U128(400), Err(PromiseError::Failed));
        assert_eq!(c.takings().0, 1_000, "NEAR returned it here, so it is accounted for");
    }

    #[test]
    fn the_terms_say_what_a_check_costs_and_where_it_looks() {
        let c = open();
        let terms = c.terms();
        assert_eq!((terms.fee.0, terms.trader_percent, terms.checks), (FEE, 40, 0));
        assert_eq!((terms.registry.as_str(), terms.cards.as_str()), ("proof.tally.testnet", CARDS));
    }

    #[test]
    #[should_panic(expected = "The trader's share is a percentage, at most 100")]
    fn the_traders_share_cant_be_more_than_the_fee() {
        as_account(TALLY, 0);
        TallyCheck::new(id(TALLY), id("proof.tally.testnet"), id(CARDS), U128(FEE), 101);
    }
}
