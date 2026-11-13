import { describe, expect, it, vi } from "vitest";
import { barHeight, differing, digitsOf, lean, settling } from "@/lib/motion";
import { sampleFingerprints } from "@/lib/sample";
import { blockHeight } from "@/lib/near";

const FP = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("a fingerprint settling", () => {
  it("ends on the fingerprint itself, however it was asked", () => {
    expect(settling(FP, 1)).toBe(FP);
    expect(settling(FP, 7)).toBe(FP);
  });

  it("settles from the left: what has settled is the fingerprint's own start", () => {
    const half = settling(FP, 0.5, () => 0);
    expect(half.slice(0, 32)).toBe(FP.slice(0, 32));
    expect(half.slice(32)).toBe("0".repeat(32));
  });

  it("is always 64 hex characters, so the page never changes width while it runs", () => {
    for (const share of [-1, 0, 0.01, 0.37, 0.99]) expect(settling(FP, share)).toMatch(/^[0-9a-f]{64}$/);
    expect(settling(FP, 0, () => 0.9999999)).toBe("f".repeat(64));
    expect(settling(FP, 0, () => 1)).toBe("f".repeat(64)); // a pick of exactly 1 still names a hex character
  });
});

describe("how far apart two fingerprints are", () => {
  it("counts the places where they differ", () => {
    expect(differing(FP, FP)).toBe(0);
    expect(differing("abcd", "abzd")).toBe(1);
    expect(differing("abcd", "ab")).toBe(2);
  });

  it("is nearly all of them for the sample card with one byte changed, which is what the page says", () => {
    const { fingerprint, oneByteChanged } = sampleFingerprints("sample-card-b.png");
    expect(differing(fingerprint, oneByteChanged)).toBeGreaterThan(50);
  });
});

describe("a fingerprint's bars", () => {
  it("stand taller for a higher character, and never at nothing", () => {
    const heights = "0123456789abcdef".split("").map(barHeight);
    expect(heights[0]).toBeGreaterThan(10);
    expect(heights[15]).toBe(100);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
  });
});

describe("a number rolled digit by digit", () => {
  it("names each digit and keeps the separators as they are", () => {
    expect(digitsOf(24)).toEqual([
      { char: "2", digit: 2 },
      { char: "4", digit: 4 },
    ]);
    expect(digitsOf(213884120).map((d) => d.char).join("")).toBe("213,884,120");
    expect(digitsOf(1234).filter((d) => d.digit === null)).toEqual([{ char: ",", digit: null }]);
  });

  it("shows a whole number that isn't below nothing", () => {
    expect(digitsOf(-3).map((d) => d.char).join("")).toBe("0");
    expect(digitsOf(2.6).map((d) => d.char).join("")).toBe("3");
  });
});

describe("a picture leaning toward the pointer", () => {
  it("lies flat under a pointer at its middle", () => {
    expect(lean(0.5, 0.5)).toEqual({ rx: 0, ry: 0 });
  });

  it("leans toward the corner the pointer is in, and no further than its most", () => {
    expect(lean(1, 0, 6)).toEqual({ rx: 6, ry: 6 });
    expect(lean(0, 1, 6)).toEqual({ rx: -6, ry: -6 });
    expect(lean(4, -2, 6)).toEqual({ rx: 6, ry: 6 }); // a pointer just past the edge leans it no more than the edge does
  });
});

describe("NEAR's newest block", () => {
  const node = (answer: unknown, ok = true) => vi.fn(async () => new Response(JSON.stringify(answer), { status: ok ? 200 : 503 })) as unknown as typeof fetch;

  it("is asked of the public node as a final block, and answers its height", async () => {
    const fetch = node({ jsonrpc: "2.0", id: "tally", result: { header: { height: 213884120 } } });
    expect(await blockHeight({ fetch, rpcUrl: "https://rpc.sample.test" })).toBe(213884120);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://rpc.sample.test");
    expect(JSON.parse(String(init.body))).toMatchObject({ method: "block", params: { finality: "final" } });
  });

  it("is nothing, never a guess, when the node is busy, says something else or can't be reached", async () => {
    expect(await blockHeight({ fetch: node({ result: { header: { height: 5 } } }, false) })).toBeNull();
    expect(await blockHeight({ fetch: node({ error: { message: "busy" } }) })).toBeNull();
    expect(await blockHeight({ fetch: node({ result: { header: { height: "12" } } }) })).toBeNull();
    const down = vi.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    expect(await blockHeight({ fetch: down })).toBeNull();
  });
});
