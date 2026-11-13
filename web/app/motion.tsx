"use client";

// The site's motion. Each piece answers something the visitor did (moved the pointer, scrolled, picked a card) or
// something NEAR said, and then it is done: nothing here loops for decoration. All of it stands still for a visitor
// who has asked their device for less motion, and the page reads the same without it.

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { barHeight, differing, digitsOf, lean, settling } from "@/lib/motion";
import { blockHeight } from "@/lib/near";
import { Bars } from "./parts";

const wantsCalm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** A mouse or trackpad: something that can rest over a part of the page without pressing it. */
const hasPointer = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** How long a fingerprint takes to settle, and how often its characters change while it does. */
const SETTLE_MS = 900;
const FLICKER_MS = 45;

/**
 * A fingerprint as the page shows it: the 64 characters in eight groups, and the same characters as bars. The first
 * time it is in view, its characters and bars run through other values and settle from the left, the way a hash is
 * worked out. What a screen reader is told is the fingerprint itself, from the start.
 */
export function Fingerprint({ fp }: { fp: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || wantsCalm()) return;
    const groups = [...el.querySelectorAll<HTMLElement>(".hash span")];
    const bars = [...el.querySelectorAll<HTMLElement>(".barcode i")];
    // the text is changed in place, so the nodes React made are still the ones on the page
    const show = (text: string) => {
      groups.forEach((group, i) => {
        if (group.firstChild) group.firstChild.nodeValue = text.slice(i * 8, i * 8 + 8);
      });
      bars.forEach((bar, i) => (bar.style.height = `${barHeight(text[i])}%`));
    };
    let frame = 0;
    let began = 0;
    let drawn = -FLICKER_MS;
    const run = (now: number) => {
      began ||= now;
      const share = (now - began) / SETTLE_MS;
      if (share >= 1) return show(fp);
      if (now - drawn >= FLICKER_MS) {
        drawn = now;
        show(settling(fp, share));
      }
      frame = requestAnimationFrame(run);
    };
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen.disconnect();
        frame = requestAnimationFrame(run);
      },
      { threshold: 0.6 },
    );
    seen.observe(el);
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
      show(fp);
    };
  }, [fp]);
  return (
    <div ref={box}>
      <p className="hash" aria-label={fp}>
        {fp.match(/.{8}/g)!.map((group, i) => (
          <span key={i} aria-hidden>
            {group}
          </span>
        ))}
      </p>
      <Bars of={fp} />
    </div>
  );
}

/**
 * One file, and the same file with a single byte changed: a button swaps between their two fingerprints, and the whole
 * code settles again. Both fingerprints are real, computed from the sample card's bytes when the site is built.
 */
export function OneByte({ fp, changed }: { fp: string; changed: string }) {
  const [nudged, setNudged] = useState(false);
  return (
    <div className="fingerprint">
      <p className="label">
        <span aria-live="polite">{nudged ? "The same file with one byte changed" : "This card's fingerprint"}</span>
        <button type="button" className="link-btn" aria-pressed={nudged} onClick={() => setNudged((was) => !was)}>
          {nudged ? "Put the byte back" : "Change one byte"}
        </button>
      </p>
      <Fingerprint fp={nudged ? changed : fp} />
      <p className="byte-note">{nudged ? `${differing(fp, changed)} of its 64 characters came out different.` : "Change a single byte of the file and watch the whole code change."}</p>
    </div>
  );
}

/**
 * A whole number whose digits roll to their places when it first shows, and roll on when it changes. Each digit is a
 * column of 0 to 9 that slides to its digit. A screen reader is told the number, not the columns.
 */
export function Roll({ value }: { value: number }) {
  const [rolled, setRolled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRolled(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const chars = digitsOf(value);
  return (
    <span className="roll">
      <span className="visually-hidden">{value.toLocaleString("en-US")}</span>
      <span aria-hidden>
        {chars.map(({ char, digit }, i) =>
          // a place is known by how far it is from the right, so the ones stay the ones when the number grows a digit
          digit === null ? (
            <span key={chars.length - i}>{char}</span>
          ) : (
            <span key={chars.length - i} className="roll-digit">
              <i style={{ transform: `translateY(${rolled ? -digit * 10 : 0}%)` }}>
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </i>
            </span>
          ),
        )}
      </span>
    </span>
  );
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** How often NEAR is asked for its newest block while the page is in view. */
const BLOCK_EVERY_MS = 4000;

/**
 * Says the chain the site reads is live: NEAR's newest final block, asked for again every few seconds while the page
 * is in view, its digits rolling on. Until NEAR answers, and if it stops answering, it says only where the site reads.
 */
export function LiveBlock() {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      const newest = document.visibilityState === "visible" ? await blockHeight() : null;
      if (!live) return;
      if (newest) setHeight((was) => Math.max(was ?? 0, newest));
      timer = setTimeout(ask, BLOCK_EVERY_MS);
    };
    void ask();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);
  if (height === null) return <span>Live on NEAR testnet</span>;
  return (
    <span>
      Block <Roll value={height} /> on NEAR testnet
    </span>
  );
}

/**
 * A picture that leans toward the pointer, with a sheen that follows it: for a verified card's picture, the one thing
 * on the site a trader holds. Under a finger, or for a visitor who asked for less motion, it is a still picture.
 */
export function Tilt({ children }: { children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  function follow(e: ReactPointerEvent) {
    const el = box.current;
    if (!el || e.pointerType !== "mouse" || wantsCalm()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const { rx, ry } = lean(x, y);
    el.dataset.live = "";
    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
    el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
  }
  function rest() {
    const el = box.current;
    if (!el) return;
    delete el.dataset.live;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }
  return (
    <span ref={box} className="tilt" onPointerMove={follow} onPointerLeave={rest}>
      <span className="tilt-in">{children}</span>
    </span>
  );
}

/** What lights up under the pointer: a framed block's edge, and the rule over each of the front page's three parts. */
const LIT = ".frame, .trio li";
/** What rises into place as it is scrolled to: a reading page's blocks and its way onward. */
const RISES = ".doc > section:not(.doc-hero), .doc > .onward";

/**
 * The motion every page shares, mounted once: a soft light that follows the pointer (behind the page, and along the
 * edge of whatever framed block it is over), and blocks further down a reading page rising into place as they are
 * scrolled to. A block already in view when the page opens is left alone, so nothing visible is ever hidden first.
 */
export function SiteMotion() {
  const path = usePathname();

  useEffect(() => {
    if (!hasPointer() || wantsCalm()) return;
    const glow = document.querySelector<HTMLElement>(".bg i");
    let frame = 0;
    let at: PointerEvent | null = null;
    const paint = () => {
      frame = 0;
      if (!at) return;
      if (glow) {
        // moved, not redrawn: the light is one soft disc slid to where the pointer is
        glow.style.transform = `translate3d(${at.clientX}px,${at.clientY}px,0)`;
        glow.dataset.on = "";
      }
      const lit = at.target instanceof Element ? at.target.closest<HTMLElement>(LIT) : null;
      if (!lit) return;
      const r = lit.getBoundingClientRect();
      lit.style.setProperty("--px", `${Math.round(at.clientX - r.left)}px`);
      lit.style.setProperty("--py", `${Math.round(at.clientY - r.top)}px`);
    };
    const move = (e: PointerEvent) => {
      at = e;
      frame ||= requestAnimationFrame(paint);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
      if (glow) delete glow.dataset.on;
    };
  }, []);

  useEffect(() => {
    if (wantsCalm()) return;
    const below = [...document.querySelectorAll<HTMLElement>(RISES)].filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.94);
    if (!below.length) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.rise = "in";
          seen.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    for (const el of below) {
      el.dataset.rise = "wait";
      seen.observe(el);
    }
    return () => {
      seen.disconnect();
      for (const el of below) delete el.dataset.rise;
    };
  }, [path]);

  return null;
}
