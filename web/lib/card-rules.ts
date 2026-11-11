// What the card contract answers when someone tries something it doesn't allow, in the contract's own words
// (contracts/card/src/lib.rs). The Verified cards page shows these; tests/sample.test.ts checks every one of them
// is still word for word in the contract.

export const REFUSALS: readonly { when: string; says: string }[] = [
  { when: "Minting for a card found Fake or Unclear", says: "Only a card the proof registry says is Real can be verified" },
  { when: "Minting for a card Tally never checked", says: "Tally hasn't checked this card, so it can't be verified" },
  { when: "Anyone but Tally asking for a mint", says: "Only Tally's attester can mint a verified card" },
  { when: "Selling it or sending it to someone else", says: "A verified card can't be transferred: it stays with the trader who earned it" },
  { when: "Minting a second one for the same card", says: "This card already has its verified card" },
  { when: "Anyone but the holder taking out its money", says: "Only the holder can withdraw what their verified card holds" },
  { when: "Giving up a card that still holds money", says: "Withdraw what this card holds before giving it up" },
];
