// The small sums behind the site's motion (app/motion.tsx), kept apart from the page so they can be tested.

const HEX = "0123456789abcdef";

/**
 * One moment of a fingerprint being worked out: the first `share` of it (0 to 1) has settled, and every character
 * after that is still some other hex character. At 1 it is the fingerprint itself.
 */
export function settling(final: string, share: number, pick: () => number = Math.random): string {
  const done = Math.round(Math.min(1, Math.max(0, share)) * final.length);
  let out = final.slice(0, done);
  for (let i = done; i < final.length; i++) out += HEX[Math.min(15, Math.floor(pick() * 16))];
  return out;
}

/** How many characters of one fingerprint differ from the same place in another. */
export function differing(a: string, b: string): number {
  let n = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n;
}

/** How tall a fingerprint character's bar stands, as a percentage: the higher the character, the taller its bar. */
export const barHeight = (c: string) => ((parseInt(c, 16) + 2) / 17) * 100;

/** A whole number as the page rolls it: its characters one by one, each digit named so it can roll to its place. */
export function digitsOf(n: number): { char: string; digit: number | null }[] {
  return Math.max(0, Math.round(n))
    .toLocaleString("en-US")
    .split("")
    .map((char) => ({ char, digit: /\d/.test(char) ? Number(char) : null }));
}

/**
 * How far a picture leans toward the pointer, in degrees. `x` and `y` say where the pointer is across and down the
 * picture, 0 to 1; at its middle it lies flat, and at an edge it leans `most` degrees.
 */
export function lean(x: number, y: number, most = 6): { rx: number; ry: number } {
  const within = (v: number) => Math.min(1, Math.max(0, v));
  const round = (v: number) => Math.round(v * 100) / 100 || 0; // never -0
  return { rx: round((0.5 - within(y)) * 2 * most), ry: round((within(x) - 0.5) * 2 * most) };
}
