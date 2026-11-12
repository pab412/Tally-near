//! An example agent wallet that asks Tally before it pays.
//!
//! Spending limits answer "how much may an agent spend". This answers the other question: "who is it safe to pay".
//! An owner loads NEAR here and lets an agent call `pay` (with a NEAR function-call key that can call nothing else).
//! Each payment names a PnL card by its fingerprint. Before any money moves, the contract asks the proof registry
//! (`contracts/proof`) about that card and the verified card contract (`contracts/card`) who holds it, on-chain, in
//! the same call. Then it follows one rule (`tally_types::decide`):
//!
//! - **Allow** (the registry says Real) and the card has a holder: the holder is paid, up to the owner's limit.
//! - **Warn** (Unclear): nothing is paid. The agent has to ask its owner.
//! - **Block** (Fake, or no record): nothing is paid.
//! - **The registry didn't answer:** nothing is paid. It fails closed: silence is never a yes.
//!
//! What the agent was told, by a message or a prompt, is never part of the decision. Only the record is.
//!
//! One deployment serves any owner: each account that loads NEAR has its own wallet and its own limit, so anyone can
//! try it without deploying a thing. This is an example on testnet, not a product people hold money in. What is
//! stored: each owner's balance and limit, and how many payments were made and refused. Never a name or a handle.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError};
use tally_types::{decide, is_fingerprint, proof_registry, verified_cards, Decision, Held, Record};

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Wallets,
}

/// One owner's money here, and the most one payment of theirs may be. Both in yoctoNEAR.
#[near(serializers = [borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Wallet {
    balance: u128,
    limit: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TallyGuard {
    /// The proof registry every decision comes from.
    registry: AccountId,
    /// The verified card contract: who holds a Real card's verified card, and so who is paid.
    cards: AccountId,
    /// Each owner's wallet. An owner's agent works with a key of the owner's that can only call `pay`.
    wallets: LookupMap<AccountId, Wallet>,
    /// How many payments went through, and how many were refused, for everyone together.
    paid: u64,
    refused: u64,
}

/// What a payment came to.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Outcome {
    /// What the rule said about the card.
    pub decision: Decision,
    /// What was paid, in yoctoNEAR. Nothing on a refusal.
    pub paid: U128,
    /// Who was paid: the account holding the card's verified card.
    pub to: Option<AccountId>,
    /// Why, in words, from the record.
    pub why: String,
}

/// An owner's wallet as anyone can read it.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Holding {
    pub balance: U128,
    pub limit: U128,
}

/// Where the wallet looks and what it has done, for anyone deciding whether to trust it.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Terms {
    pub registry: AccountId,
    pub cards: AccountId,
    pub paid: u64,
    pub refused: u64,
}

const GAS_FOR_READING: Gas = Gas::from_tgas(5);
const GAS_FOR_DECIDING: Gas = Gas::from_tgas(20);
const GAS_FOR_SETTLING: Gas = Gas::from_tgas(5);
// a wallet takes storage here; a first load of at least this keeps that from being used to fill the contract
const LEAST_FIRST_LOAD: u128 = 1_000_000_000_000_000_000_000; // 0.001 NEAR

const NOT_A_FINGERPRINT: &str = "A fingerprint is 64 lower-case hex characters";
const NO_WALLET: &str = "This account has no wallet here: load one with deposit first";
const OVER_THE_LIMIT: &str = "That is more than the owner's limit for one payment";
const NOT_ENOUGH: &str = "The wallet doesn't hold that much";

#[near]
impl TallyGuard {
    #[init]
    pub fn new(registry: AccountId, cards: AccountId) -> Self {
        Self {
            registry,
            cards,
            wallets: LookupMap::new(Key::Wallets),
            paid: 0,
            refused: 0,
        }
    }

    /// Loads the attached NEAR into the caller's wallet. `limit` is the most one payment may be, in yoctoNEAR: it
    /// has to be given the first time, and changes the limit when given again. Answers the wallet as it is now.
    #[payable]
    pub fn deposit(&mut self, limit: Option<U128>) -> Holding {
        let owner = env::predecessor_account_id();
        let amount = env::attached_deposit().as_yoctonear();
        let wallet = match (self.wallets.get(&owner).copied(), limit) {
            (Some(w), limit) => Wallet {
                balance: w.balance + amount,
                limit: limit.map_or(w.limit, |l| l.0),
            },
            (None, Some(limit)) => {
                require!(amount >= LEAST_FIRST_LOAD, "Load at least 0.001 NEAR to open a wallet");
                Wallet {
                    balance: amount,
                    limit: limit.0,
                }
            }
            (None, None) => env::panic_str("Say the most one payment may be: deposit needs a limit the first time"),
        };
        require!(wallet.limit > 0, "The limit has to be more than nothing");
        self.wallets.insert(owner, wallet);
        Holding {
            balance: U128(wallet.balance),
            limit: U128(wallet.limit),
        }
    }

    /// Asks to pay `amount` yoctoNEAR, from the caller's wallet, to whoever holds the verified card of the card with
    /// this fingerprint. The registry is asked first, and the money moves only if the rule says allow.
    pub fn pay(&mut self, fingerprint: String, amount: U128) -> Promise {
        let owner = env::predecessor_account_id();
        let Some(wallet) = self.wallets.get(&owner) else {
            env::panic_str(NO_WALLET)
        };
        require!(is_fingerprint(&fingerprint), NOT_A_FINGERPRINT);
        require!(amount.0 > 0, "A payment has to be more than nothing");
        require!(amount.0 <= wallet.limit, OVER_THE_LIMIT);
        require!(amount.0 <= wallet.balance, NOT_ENOUGH);
        proof_registry::ext(self.registry.clone())
            .with_static_gas(GAS_FOR_READING)
            .get(fingerprint.clone())
            .and(
                verified_cards::ext(self.cards.clone())
                    .with_static_gas(GAS_FOR_READING)
                    .nft_token(fingerprint.clone()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_DECIDING)
                    .on_asked(owner, fingerprint, amount),
            )
    }

    /// The registry's and the card contract's answers to `pay`. Only this contract can call it. A refusal is an
    /// answer, not an error, so whoever asked can read why.
    #[private]
    pub fn on_asked(
        &mut self,
        owner: AccountId,
        fingerprint: String,
        amount: U128,
        #[callback_result] record: Result<Option<Record>, PromiseError>,
        #[callback_result] card: Result<Option<Held>, PromiseError>,
    ) -> Outcome {
        // no answer is no record: the rule blocks on both
        let (record, answered) = match record {
            Ok(record) => (record, true),
            Err(_) => (None, false),
        };
        let decision = decide(record.as_ref());
        let holder = card.ok().flatten().map(|held| held.owner_id);
        // the wallet is looked at again: another payment may have used the money, or the owner lowered the limit
        let wallet = self
            .wallets
            .get(&owner)
            .copied()
            .unwrap_or(Wallet { balance: 0, limit: 0 });
        let covered = amount.0 <= wallet.balance && amount.0 <= wallet.limit;
        let why = match (&record, decision, &holder) {
            (_, _, _) if !answered => "The proof registry didn't answer, so nothing was paid".to_string(),
            (None, _, _) => "No record: Tally has never checked this card".to_string(),
            (Some(r), Decision::Allow, Some(_)) if covered => {
                format!("The registry says Real (check {})", r.latest.check_id)
            }
            (Some(_), Decision::Allow, Some(_)) => {
                "The registry says Real, but the wallet no longer covers this payment".to_string()
            }
            (Some(r), Decision::Allow, None) => format!(
                "The registry says Real (check {}), but the card has no verified card, so there is nobody to pay",
                r.latest.check_id
            ),
            (Some(r), Decision::Warn, _) => format!(
                "The registry says Unclear (check {}): ask the owner before paying",
                r.latest.check_id
            ),
            (Some(r), Decision::Block, _) => format!("The registry says Fake (check {})", r.latest.check_id),
        };
        let Some(to) = holder.filter(|_| decision == Decision::Allow && covered) else {
            self.refused += 1;
            self.log("refused", &owner, &fingerprint, decision, 0, None);
            return Outcome {
                decision,
                paid: U128(0),
                to: None,
                why,
            };
        };
        self.wallets.insert(
            owner.clone(),
            Wallet {
                balance: wallet.balance - amount.0,
                ..wallet
            },
        );
        self.paid += 1;
        Promise::new(to.clone())
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_SETTLING)
                    .on_paid(owner.clone(), amount),
            )
            .detach();
        self.log("paid", &owner, &fingerprint, decision, amount.0, Some(&to));
        Outcome {
            decision,
            paid: amount,
            to: Some(to),
            why,
        }
    }

    /// Whether the payment arrived. Only this contract can call it. If it didn't, the money is put back.
    #[private]
    pub fn on_paid(&mut self, owner: AccountId, amount: U128, #[callback_result] sent: Result<(), PromiseError>) {
        if sent.is_err() {
            self.put_back(owner, amount.0, None);
            self.paid -= 1;
        }
    }

    /// Sends what the caller's wallet still holds back to them, and closes it.
    pub fn refund(&mut self) -> Promise {
        let owner = env::predecessor_account_id();
        let Some(wallet) = self.wallets.remove(&owner) else {
            env::panic_str(NO_WALLET)
        };
        require!(wallet.balance > 0, "There is nothing to send back");
        Promise::new(owner.clone())
            .transfer(NearToken::from_yoctonear(wallet.balance))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_SETTLING)
                    .on_refunded(owner, U128(wallet.balance), U128(wallet.limit)),
            )
    }

    /// Whether the refund arrived. Only this contract can call it. If it didn't, the wallet is put back.
    #[private]
    pub fn on_refunded(
        &mut self,
        owner: AccountId,
        amount: U128,
        limit: U128,
        #[callback_result] sent: Result<(), PromiseError>,
    ) -> U128 {
        if sent.is_ok() {
            return amount;
        }
        self.put_back(owner, amount.0, Some(limit.0));
        U128(0)
    }

    /// An owner's wallet: what it holds and the most one payment may be. Nothing when the account has none.
    pub fn wallet_of(&self, account_id: AccountId) -> Option<Holding> {
        self.wallets.get(&account_id).map(|w| Holding {
            balance: U128(w.balance),
            limit: U128(w.limit),
        })
    }

    pub fn terms(&self) -> Terms {
        Terms {
            registry: self.registry.clone(),
            cards: self.cards.clone(),
            paid: self.paid,
            refused: self.refused,
        }
    }
}

impl TallyGuard {
    /// Money that didn't leave goes back into the owner's wallet (a wallet closed meanwhile is opened again).
    fn put_back(&mut self, owner: AccountId, amount: u128, limit: Option<u128>) {
        let was = self.wallets.get(&owner).copied();
        let wallet = Wallet {
            balance: was.map_or(0, |w| w.balance) + amount,
            limit: was.map(|w| w.limit).or(limit).unwrap_or(amount),
        };
        self.wallets.insert(owner, wallet);
    }

    /// One event per decision (NEP-297), so anyone can list what was paid and what was refused.
    fn log(
        &self,
        event: &str,
        owner: &AccountId,
        fingerprint: &str,
        decision: Decision,
        amount: u128,
        to: Option<&AccountId>,
    ) {
        let to = to.map_or("null".to_string(), |id| format!(r#""{id}""#));
        env::log_str(&format!(
            r#"EVENT_JSON:{{"standard":"tally_guard","version":"1.0.0","event":"{event}","data":[{{"owner":"{owner}","fingerprint":"{fingerprint}","decision":"{decision:?}","amount":"{amount}","to":{to}}}]}}"#
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
    use near_sdk::testing_env;
    use tally_types::{Proof, Verdict};

    const FP: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const GUARD: &str = "guard.tally.testnet";
    const OWNER: &str = "fund.testnet";
    const TRADER: &str = "trader.testnet";
    const LIMIT: u128 = 1_000;

    fn id(who: &str) -> AccountId {
        who.parse().unwrap()
    }

    /// Who is calling, with how many yoctoNEAR attached. The contract itself is always GUARD.
    fn as_account(who: &str, yocto: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(id(GUARD))
            .predecessor_account_id(id(who))
            .attached_deposit(NearToken::from_yoctonear(yocto))
            .build());
    }

    const LOADED: u128 = LEAST_FIRST_LOAD + 2_500;

    /// The owner's wallet pays at most 1,000 at a time, with a little over 0.001 NEAR loaded.
    fn open() -> TallyGuard {
        as_account(OWNER, 0);
        let mut g = TallyGuard::new(id("proof.tally.testnet"), id("card.tally.testnet"));
        as_account(OWNER, LOADED);
        assert_eq!(
            g.deposit(Some(U128(LIMIT))),
            Holding {
                balance: U128(LOADED),
                limit: U128(LIMIT)
            }
        );
        g
    }

    /// What the registry answers for a card whose latest verdict is `verdict`.
    fn says(verdict: Verdict) -> Result<Option<Record>, PromiseError> {
        Ok(Some(Record {
            fingerprint: FP.into(),
            latest: Proof {
                verdict,
                check_id: "k3x9q2".into(),
                recorded_at_ms: 500,
            },
            entries: 1,
        }))
    }

    fn held() -> Result<Option<Held>, PromiseError> {
        Ok(Some(Held { owner_id: id(TRADER) }))
    }

    /// The owner's agent asks to pay 400, then the contract receives both answers.
    fn asked(
        g: &mut TallyGuard,
        record: Result<Option<Record>, PromiseError>,
        card: Result<Option<Held>, PromiseError>,
    ) -> Outcome {
        as_account(OWNER, 0);
        let _ = g.pay(FP.into(), U128(400));
        as_account(GUARD, 0);
        g.on_asked(id(OWNER), FP.into(), U128(400), record, card)
    }

    /// The NEAR this contract sent out in the last step: who to, and how many yoctoNEAR.
    fn sent() -> Vec<(String, u128)> {
        get_created_receipts()
            .into_iter()
            .flat_map(|receipt| {
                let to = receipt.receiver_id.to_string();
                receipt.actions.into_iter().filter_map(move |action| match action {
                    near_sdk::mock::MockAction::Transfer { deposit, .. } => Some((to.clone(), deposit.as_yoctonear())),
                    _ => None,
                })
            })
            .collect()
    }

    /// What the owner's wallet holds beyond the first load, and how many payments were made and refused.
    fn state(g: &TallyGuard) -> (u128, u64, u64) {
        let t = g.terms();
        let balance = g.wallet_of(id(OWNER)).map_or(0, |w| w.balance.0);
        (balance.saturating_sub(LEAST_FIRST_LOAD), t.paid, t.refused)
    }

    #[test]
    fn a_real_card_with_a_holder_is_paid() {
        let mut g = open();
        let outcome = asked(&mut g, says(Verdict::Real), held());
        assert_eq!(
            (outcome.decision, outcome.paid.0, outcome.to),
            (Decision::Allow, 400, Some(id(TRADER)))
        );
        assert_eq!(outcome.why, "The registry says Real (check k3x9q2)");
        assert_eq!(
            sent(),
            vec![(TRADER.to_string(), 400)],
            "the holder is paid, nobody else"
        );
        assert_eq!(state(&g), (2_100, 1, 0));
        assert!(get_logs().join("\n").contains(r#""event":"paid""#));
    }

    #[test]
    fn an_unclear_card_is_not_paid_and_the_owner_is_to_be_asked() {
        let mut g = open();
        let outcome = asked(&mut g, says(Verdict::Unclear), held());
        assert_eq!(
            (outcome.decision, outcome.paid.0, outcome.to),
            (Decision::Warn, 0, None)
        );
        assert!(outcome.why.contains("ask the owner"));
        assert_eq!(sent(), vec![]);
        assert_eq!(state(&g), (2_500, 0, 1), "the money stays");
    }

    #[test]
    fn a_fake_card_is_refused_whoever_still_holds_its_verified_card() {
        let mut g = open();
        let outcome = asked(&mut g, says(Verdict::Fake), held());
        assert_eq!(
            (outcome.decision, outcome.paid.0, outcome.to),
            (Decision::Block, 0, None)
        );
        assert_eq!(outcome.why, "The registry says Fake (check k3x9q2)");
        assert_eq!(sent(), vec![]);
        assert_eq!(state(&g), (2_500, 0, 1));
        assert!(get_logs().join("\n").contains(r#""event":"refused""#));
    }

    #[test]
    fn a_card_tally_never_checked_is_refused() {
        let mut g = open();
        let outcome = asked(&mut g, Ok(None), held());
        assert_eq!((outcome.decision, outcome.paid.0), (Decision::Block, 0));
        assert_eq!(outcome.why, "No record: Tally has never checked this card");
        assert_eq!((sent(), state(&g)), (vec![], (2_500, 0, 1)));
    }

    #[test]
    fn when_the_registry_does_not_answer_nothing_is_paid() {
        let mut g = open();
        let outcome = asked(&mut g, Err(PromiseError::Failed), held());
        assert_eq!(
            (outcome.decision, outcome.paid.0),
            (Decision::Block, 0),
            "it fails closed: silence is never a yes"
        );
        assert_eq!(outcome.why, "The proof registry didn't answer, so nothing was paid");
        assert_eq!((sent(), state(&g)), (vec![], (2_500, 0, 1)));
    }

    #[test]
    fn a_real_card_nobody_holds_has_nobody_to_pay() {
        let mut g = open();
        for card in [Ok(None), Err(PromiseError::Failed)] {
            let outcome = asked(&mut g, says(Verdict::Real), card);
            assert_eq!(
                (outcome.decision, outcome.paid.0, outcome.to),
                (Decision::Allow, 0, None)
            );
            assert!(outcome.why.contains("nobody to pay"));
        }
        assert_eq!((sent(), state(&g)), (vec![], (2_500, 0, 2)));
    }

    #[test]
    #[should_panic(expected = "more than the owner's limit")]
    fn a_payment_over_the_limit_is_refused_before_anyone_is_asked() {
        let mut g = open();
        as_account(OWNER, 0);
        let _ = g.pay(FP.into(), U128(LIMIT + 1));
    }

    #[test]
    #[should_panic(expected = "doesn't hold that much")]
    fn a_payment_of_more_than_the_wallet_holds_is_refused() {
        as_account(OWNER, 0);
        let mut g = TallyGuard::new(id("proof.tally.testnet"), id("card.tally.testnet"));
        as_account(OWNER, LEAST_FIRST_LOAD);
        g.deposit(Some(U128(LEAST_FIRST_LOAD * 2)));
        as_account(OWNER, 0);
        let _ = g.pay(FP.into(), U128(LEAST_FIRST_LOAD + 1));
    }

    #[test]
    fn money_spent_while_the_registry_was_being_asked_is_not_spent_twice() {
        as_account(OWNER, 0);
        let mut g = TallyGuard::new(id("proof.tally.testnet"), id("card.tally.testnet"));
        let each = LEAST_FIRST_LOAD; // the wallet holds two and a half payments of this
        as_account(OWNER, each * 5 / 2);
        g.deposit(Some(U128(each)));
        as_account(OWNER, 0);
        for _ in 0..3 {
            let _ = g.pay(FP.into(), U128(each));
        }
        as_account(GUARD, 0);
        let outcomes: Vec<Outcome> = (0..3)
            .map(|_| g.on_asked(id(OWNER), FP.into(), U128(each), says(Verdict::Real), held()))
            .collect();
        assert_eq!(
            outcomes.iter().map(|o| o.paid.0).collect::<Vec<_>>(),
            vec![each, each, 0],
            "two and a half payments' worth pays two, not three"
        );
        assert_eq!(
            outcomes[2].why,
            "The registry says Real, but the wallet no longer covers this payment"
        );
        assert_eq!(g.wallet_of(id(OWNER)).unwrap().balance.0, each / 2);
    }

    #[test]
    #[should_panic(expected = "has no wallet here")]
    fn nobody_can_pay_from_a_wallet_that_is_not_theirs() {
        let mut g = open();
        as_account(TRADER, 0);
        let _ = g.pay(FP.into(), U128(400));
    }

    #[test]
    fn loading_goes_into_the_callers_own_wallet_only() {
        let mut g = open();
        as_account(TRADER, LEAST_FIRST_LOAD);
        g.deposit(Some(U128(5)));
        assert_eq!(
            g.wallet_of(id(TRADER)),
            Some(Holding {
                balance: U128(LEAST_FIRST_LOAD),
                limit: U128(5)
            })
        );
        assert_eq!(state(&g).0, 2_500, "the owner's wallet is untouched");
    }

    #[test]
    #[should_panic(expected = "has no wallet here")]
    fn nobody_can_take_back_money_that_is_not_theirs() {
        let mut g = open();
        as_account(TRADER, 0);
        let _ = g.refund();
    }

    #[test]
    #[should_panic(expected = "needs a limit the first time")]
    fn a_wallet_cannot_be_opened_without_a_limit() {
        let mut g = open();
        as_account(TRADER, LEAST_FIRST_LOAD);
        g.deposit(None);
    }

    #[test]
    #[should_panic(expected = "at least 0.001 NEAR")]
    fn a_wallet_cannot_be_opened_with_dust() {
        let mut g = open();
        as_account(TRADER, 5);
        g.deposit(Some(U128(5)));
    }

    #[test]
    fn the_owner_can_top_up_and_change_the_limit() {
        let mut g = open();
        as_account(OWNER, 100);
        assert_eq!(g.deposit(None).limit.0, LIMIT, "the limit stays when none is given");
        as_account(OWNER, 0);
        assert_eq!(
            g.deposit(Some(U128(7))),
            Holding {
                balance: U128(LOADED + 100),
                limit: U128(7)
            }
        );
    }

    #[test]
    fn a_limit_lowered_while_the_registry_was_being_asked_holds() {
        let mut g = open();
        as_account(OWNER, 0);
        let _ = g.pay(FP.into(), U128(400));
        g.deposit(Some(U128(100)));
        as_account(GUARD, 0);
        let outcome = g.on_asked(id(OWNER), FP.into(), U128(400), says(Verdict::Real), held());
        assert_eq!((outcome.paid.0, outcome.to), (0, None));
    }

    #[test]
    #[should_panic(expected = "64 lower-case hex")]
    fn a_name_is_not_a_fingerprint() {
        let mut g = open();
        as_account(OWNER, 0);
        let _ = g.pay("@some_trader".into(), U128(400));
    }

    #[test]
    fn a_payment_that_did_not_arrive_is_put_back() {
        let mut g = open();
        asked(&mut g, says(Verdict::Real), held());
        as_account(GUARD, 0);
        g.on_paid(id(OWNER), U128(400), Err(PromiseError::Failed));
        assert_eq!(state(&g), (2_500, 0, 0));
    }

    #[test]
    fn the_owner_takes_back_what_is_left() {
        let mut g = open();
        asked(&mut g, says(Verdict::Real), held());
        as_account(OWNER, 0);
        let _ = g.refund();
        assert_eq!(sent(), vec![(OWNER.to_string(), LOADED - 400)]);
        assert_eq!(g.wallet_of(id(OWNER)), None, "the wallet is closed");
        as_account(GUARD, 0);
        assert_eq!(
            g.on_refunded(id(OWNER), U128(LOADED - 400), U128(LIMIT), Err(PromiseError::Failed))
                .0,
            0
        );
        assert_eq!(
            g.wallet_of(id(OWNER)),
            Some(Holding {
                balance: U128(LOADED - 400),
                limit: U128(LIMIT)
            }),
            "a refund that didn't arrive is put back, limit and all"
        );
    }

    #[test]
    fn its_terms_say_who_it_asks() {
        let g = open();
        let t = g.terms();
        assert_eq!(
            (t.registry.as_str(), t.cards.as_str(), t.paid, t.refused),
            ("proof.tally.testnet", "card.tally.testnet", 0, 0)
        );
    }
}
