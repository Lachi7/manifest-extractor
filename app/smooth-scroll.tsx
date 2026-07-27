"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// One shared instance so any component can pause the page scroll (e.g. while
// the enlarge modal is open) without prop-drilling a ref through the tree.
let instance: Lenis | null = null;

export function getLenis(): Lenis | null {
  return instance;
}

/** Pause / resume page scrolling (modal open ⇒ locked). */
export function lockScroll(locked: boolean) {
  if (!instance) return;
  if (locked) instance.stop();
  else instance.start();
}

/** `immediate` jumps (view swap); otherwise it glides back up. */
export function scrollToTop(immediate = false) {
  if (instance) instance.scrollTo(0, immediate ? { immediate: true } : { duration: 1.4 });
  else window.scrollTo(0, 0); // reduced motion / Lenis not mounted
}

/** Glide to an element (CSS selector), e.g. the hero button → the drop zone. */
export function scrollToEl(selector: string) {
  if (instance) instance.scrollTo(selector, { duration: 1.6, offset: -40 });
  else document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Mounts Lenis and publishes the scroll state as CSS custom properties on
 * <html>, so every scroll-driven effect on the page is plain CSS reading:
 *
 *   --scroll-y  scroll offset in px (unitless — multiply by 1px in calc())
 *   --scroll-p  progress through the document, 0 → 1
 *   --scroll-v  signed velocity, roughly −1 → 1 (the anchor's "drag")
 *
 * One rAF loop, three variables, no per-element JS work while scrolling.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // native scroll, no scroll-linked motion

    const lenis = new Lenis({
      // Low lerp = long settle. This is the weight — each wheel notch glides
      // to a stop rather than snapping, like hauling a chain up.
      lerp: 0.075,
      wheelMultiplier: 0.9,
      syncTouch: true,
      syncTouchLerp: 0.09,
      touchInertiaExponent: 1.6,
    });
    instance = lenis;

    const root = document.documentElement;
    const onScroll = () => {
      const limit = lenis.limit || 1;
      root.style.setProperty("--scroll-y", lenis.scroll.toFixed(1));
      root.style.setProperty("--scroll-p", clamp(lenis.scroll / limit, 0, 1).toFixed(4));
      // Velocity arrives in px/frame; ~40 saturates on a hard flick.
      root.style.setProperty("--scroll-v", clamp(lenis.velocity / 40, -1, 1).toFixed(3));
    };
    lenis.on("scroll", onScroll);
    onScroll();

    let frame = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      instance = null;
      root.style.removeProperty("--scroll-y");
      root.style.removeProperty("--scroll-p");
      root.style.removeProperty("--scroll-v");
    };
  }, []);

  return null;
}
