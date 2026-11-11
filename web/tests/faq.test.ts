import { describe, expect, it } from "vitest";
import { FAQ, searchFaq } from "@/lib/faq";

const questions = (groups: ReturnType<typeof searchFaq>) => groups.flatMap((g) => g.questions.map((x) => x.q));

describe("the Questions page", () => {
  it("has four groups, and no question twice", () => {
    expect(FAQ.map((g) => g.title)).toEqual(["Trust and verification", "Privacy", "Verified cards", "AI and payments"]);
    const all = questions([...FAQ]);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(FAQ.map((g) => g.id)).size).toBe(FAQ.length);
  });

  it("says plainly that looking a card up is free, and that no outside agent pays yet", () => {
    const text = FAQ.flatMap((g) => g.questions.map((x) => x.a)).join(" ");
    expect(text).toContain("Looking a card up is free for everyone");
    expect(text).toContain("No outside agent pays yet");
    expect(text).toContain("Tally's own checks are not written to NEAR yet");
  });

  it("only links to pages the site has", () => {
    const pages = ["/how-it-works", "/verified-cards", "/agents"];
    for (const { more } of FAQ.flatMap((g) => g.questions)) if (more) expect(pages, more.href).toContain(more.href.split("#")[0]);
  });
});

describe("searching the questions", () => {
  it("shows everything until something is typed", () => {
    expect(searchFaq(FAQ, "")).toEqual(FAQ);
    expect(searchFaq(FAQ, "   ")).toEqual(FAQ);
  });

  it("finds a word in a question or in its answer, whatever its case", () => {
    expect(questions(searchFaq(FAQ, "MAINNET"))).toEqual(["Is this on NEAR mainnet?"]);
    // "burned" is only in answers
    expect(questions(searchFaq(FAQ, "burned"))).toEqual(["What happens when a verdict changes?", "Why would an agent pay when reading is free?"]);
  });

  it("needs every word typed, and drops a group left with nothing", () => {
    const found = searchFaq(FAQ, "picture uploaded");
    expect(found.map((g) => g.id)).toEqual(["privacy"]);
    expect(questions(found)).toEqual(["Is my card picture uploaded anywhere?"]);
  });

  it("gives nothing for something no question covers", () => {
    expect(searchFaq(FAQ, "zebra")).toEqual([]);
  });
});
