// The Questions page: every question, in its group, and the search over them. The answers are plain text so the
// search reads exactly what the page shows; a question can end with one link to the page that says more.

export interface Question {
  q: string;
  a: string;
  more?: { href: string; label: string };
}

export interface QuestionGroup {
  id: string;
  title: string;
  questions: readonly Question[];
}

export const FAQ: readonly QuestionGroup[] = [
  {
    id: "trust",
    title: "Trust and verification",
    questions: [
      {
        q: "How does verification work?",
        a: "Your browser turns a card's picture into a fingerprint. Tally checks the card and writes the fingerprint and its verdict to NEAR. After that, anyone can look the fingerprint up.",
        more: { href: "/how-it-works", label: "See the three steps" },
      },
      {
        q: "What is a fingerprint?",
        a: "A 64-character code your browser makes from a card's picture. The same picture always gives the same code, and any change gives a different one.",
      },
      {
        q: "Can Tally change a verdict later?",
        a: "It can add a correction, which shows up as a new entry. It can't remove or rewrite the earlier one.",
      },
      {
        q: "What happens if a card is edited?",
        a: "Any edit changes the fingerprint, so the edited picture has no record. It shows as not checked.",
      },
      {
        q: "Why NEAR, and not Tally's own database?",
        a: "A verdict Tally could quietly change isn't proof. On NEAR a record can only be added to, the badge's rules run in a contract and not on Tally's say-so, and anyone can read it without asking Tally for anything.",
      },
      {
        q: "Is this on NEAR mainnet?",
        a: "No. It runs on NEAR testnet for the hackathon, and the records are sample cards. Tally's own checks are not written to NEAR yet. The contracts are the ones that would go to mainnet.",
      },
      {
        q: "What was built for the hackathon?",
        a: "Everything on NEAR: the three contracts and this site. Tally itself (reading cards and checking them) existed before and isn't part of the entry.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    questions: [
      {
        q: "Is my card picture uploaded anywhere?",
        a: "No. The fingerprint is computed in your browser, and only the fingerprint is sent.",
      },
      {
        q: "What information is stored on NEAR?",
        a: "The card's fingerprint, the verdict, the time and Tally's id for the check. A verified card also stores the NEAR account that holds it.",
      },
      {
        q: "Can other people see my private information?",
        a: "A record has no name, no handle and no picture. What is public is the fingerprint and its verdict. If you hold a verified card, the NEAR account you chose to hold it is public too.",
      },
    ],
  },
  {
    id: "cards",
    title: "Verified cards",
    questions: [
      {
        q: "Who can mint a verified card?",
        a: "Only Tally's own account can ask for one, and the contract still refuses unless the record on NEAR says Real.",
      },
      {
        q: "Can it be transferred or sold?",
        a: "No. The contract refuses every transfer, so a verified card can't be bought.",
      },
      {
        q: "What happens when a verdict changes?",
        a: "Anyone can ask the contract to recheck the card. If the record no longer says Real, the verified card is burned, with any money it still held.",
        more: { href: "/verified-cards", label: "See Verified cards" },
      },
      {
        q: "How does a trader earn from a verified card?",
        a: "When an AI agent pays to check a card, part of the fee goes into that card's verified card. The trader can take it out while the card is still Real. No outside agent pays yet, so today this is a working mechanism, not income.",
      },
    ],
  },
  {
    id: "payments",
    title: "AI and payments",
    questions: [
      {
        q: "Does it cost anything to look a card up?",
        a: "No. Looking a card up is free for everyone, people and AI agents.",
      },
      {
        q: "What does a paid check cost?",
        a: "One fee for each answered check, set in the contract. The For AI agents page reads the current fee from NEAR. A card with no record costs nothing.",
        more: { href: "/agents#cost", label: "See the fee" },
      },
      {
        q: "Why would an agent pay when reading is free?",
        a: "For the receipt. A paid check leaves a public record on NEAR that this agent checked this card before it acted, which its owner can audit. The fee also pays the trader, and a paid check is what gets a badge burned once its verdict was corrected.",
      },
      {
        q: "Can agents overspend?",
        a: "No. The owner loads a small credit and gives the agent a key that can only pay for checks. NEAR refuses anything else that key tries, and the contract refuses a check once the credit is gone.",
      },
      {
        q: "How do payments work?",
        a: "The agent's owner loads credit into the paid check contract. Each answered check takes one fee from it, and part of that fee goes into the card's verified card. The owner can take back what's unspent at any time.",
        more: { href: "/agents", label: "See For AI agents" },
      },
    ],
  },
];

/**
 * The groups with only the questions that match what was typed: every word has to appear in the question or its
 * answer. Groups left with nothing are dropped, and an empty search gives everything.
 */
export function searchFaq(groups: readonly QuestionGroup[], typed: string): QuestionGroup[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...groups];
  return groups
    .map((group) => ({
      ...group,
      questions: group.questions.filter(({ q, a }) => {
        const text = `${q} ${a}`.toLowerCase();
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((group) => group.questions.length > 0);
}
