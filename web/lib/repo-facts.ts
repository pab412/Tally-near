// What the pages say about how this repository is tested. tests/facts.test.ts checks every number against the
// README, which states what each test run printed, so the site can't claim a test that isn't there.

/** Unit tests in each contract (`cargo test` in contracts/<name>). */
export const CONTRACT_TESTS = { proof: 7, card: 30, check: 21 } as const;

/** Unit tests across the three contracts. */
export const CONTRACT_UNIT_TESTS = CONTRACT_TESTS.proof + CONTRACT_TESTS.card + CONTRACT_TESTS.check;

/** Things web/scripts/e2e-contracts.mjs checks against the contracts deployed on NEAR testnet. */
export const TESTNET_CHECKS = 43;
