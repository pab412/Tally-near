import { describe, expect, it } from "vitest";
import { addressOf, guessLimiter } from "@/lib/limit";

describe("the cap on wrong passwords", () => {
  it("blocks after the set number of wrong guesses, and lets in again once the window passes", () => {
    const guesses = guessLimiter({ perVisitor: 3, windowMs: 1_000 });
    for (let i = 0; i < 3; i++) {
      expect(guesses.blocked("a", 100)).toBe(false);
      guesses.missed("a", 100);
    }
    expect(guesses.blocked("a", 500)).toBe(true);
    expect(guesses.blocked("b", 500), "another visitor").toBe(false);
    expect(guesses.blocked("a", 1_200), "the window has passed").toBe(false);
  });

  it("reads the visitor's address the way Vercel passes it", () => {
    expect(addressOf(new Request("https://x", { headers: { "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" } }))).toBe("203.0.113.7");
    expect(addressOf(new Request("https://x", { headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.1" } }))).toBe("198.51.100.9");
    expect(addressOf(new Request("https://x"))).toBe("unknown");
  });
});
