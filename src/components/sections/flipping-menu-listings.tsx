"use client";

import { Children, isValidElement, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Snapshot = { view: string; content: ReactNode; outgoingCount?: number };

/** Retain just one accessible listing while its cards turn edge-on and change faces. */
export function FlippingMenuListings({ view, children, imageSources = [] }: { view: string; children: ReactNode; imageSources?: string[] }) {
  const imageKey = JSON.stringify(imageSources);
  const rootRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Snapshot>({ view, content: children });
  const animations = useRef<Animation[]>([]);
  const entering = useRef(false);
  const scroll = useRef(0);
  const latest = useRef(children);

  useLayoutEffect(() => { latest.current = children; }, [children]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    const cards = [...root.querySelectorAll<HTMLElement>(".catalog-item")];
    // Capture the current visual position before cancelling an interrupted turn.
    const current = cards.map(card => ({ transform: getComputedStyle(card).transform, opacity: getComputedStyle(card).opacity }));
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const easing = getComputedStyle(root).getPropertyValue("--ease-in-out").trim() || "cubic-bezier(0.77, 0, 0.175, 1)";
    const timing = splitFlipTiming(easing);
    const direction = view === "preorder" ? 1 : -1;
    const turningOut = view !== shown.view;
    const turningIn = !turningOut && entering.current;
    entering.current = false;
    const release = () => {
      root.style.minHeight = "";
      root.inert = false;
      root.removeAttribute("aria-hidden");
      window.scrollTo({ top: Math.min(scroll.current, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)), behavior: "instant" });
    };

    if (!turningOut && !turningIn) {
      root.style.minHeight = "";
      root.inert = false;
      root.removeAttribute("aria-hidden");
      return;
    }
    if (turningOut) {
      scroll.current = window.scrollY;
      root.style.minHeight = `${root.getBoundingClientRect().height}px`;
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    } else {
      root.inert = false;
      root.removeAttribute("aria-hidden");
    }
    const start = () => {
      if (disposed) return;
      animations.current = cards.map((card, index) => {
        const fade = reduced || index >= (turningOut ? cardCount(latest.current) : (shown.outgoingCount ?? 0));
        const frames = fade
          ? [{ opacity: turningOut ? current[index].opacity : 0 }, { opacity: turningOut ? 0 : 1 }]
          : [{ transform: turningOut ? current[index].transform : face(-direction * 90), opacity: turningOut ? current[index].opacity : 0, backfaceVisibility: "hidden" }, { transform: face(turningOut ? direction * 90 : 0), opacity: turningOut ? 0 : 1, backfaceVisibility: "hidden" }];
        const phase = turningOut ? timing.out : timing.into;
        return card.animate(frames, { duration: reduced ? 80 : phase.duration, easing: reduced ? "linear" : phase.easing, fill: "both" });
      });
      void Promise.all(animations.current.map(animation => animation.finished.catch(() => undefined))).then(() => {
        if (disposed) return;
        if (turningOut) {
          entering.current = true;
          setShown({ view, content: latest.current, outgoingCount: cards.length });
        } else {
          animations.current.forEach(animation => animation.cancel());
          animations.current = [];
          release();
        }
      });
    };
    // Keep the current menu visible until every destination photo can be painted.
    if (turningOut) void prepareImages(JSON.parse(imageKey) as string[]).then(start);
    else start();
    // Keep handles until the next setup can sample their current visual state.
    return () => { disposed = true; };
  }, [view, shown, imageKey]);

  useLayoutEffect(() => () => {
    animations.current.forEach(animation => animation.cancel());
  }, []);

  return <div ref={rootRef}><div key={shown.view}>{view === shown.view ? children : shown.content}</div></div>;
}

function face(degrees: number) {
  return `perspective(900px) rotateY(${degrees}deg)`;
}

/** Count slots in the incoming grids without mounting a second interactive listing. */
function cardCount(content: ReactNode): number {
  return Children.toArray(content).reduce<number>((count, child) => {
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return count;
    if (child.props.className?.split(" ").includes("catalog-grid")) return count + Children.count(child.props.children);
    return count + cardCount(child.props.children);
  }, 0);
}

/** Split the brand curve at half rotation, preserving its speed through the swap.
 * Two complete ease-in-out curves would stop at the midpoint instead.
 */
function splitFlipTiming(easing: string) {
  const values = easing.match(/cubic-bezier\(([^)]+)\)/)?.[1].split(",").map(Number);
  const [x1, y1, x2, y2] = values?.length === 4 && values.every(Number.isFinite)
    ? values : [0.77, 0, 0.175, 1];
  const point = (t: number) => ({
    x: 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3,
    y: 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3,
  });
  let low = 0, high = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (point(mid).y < 0.5) low = mid;
    else high = mid;
  }
  const t = (low + high) / 2;
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = lerp({ x: 0, y: 0 }, { x: x1, y: y1 });
  const b = lerp({ x: x1, y: y1 }, { x: x2, y: y2 });
  const c = lerp({ x: x2, y: y2 }, { x: 1, y: 1 });
  const d = lerp(a, b), e = lerp(b, c), split = lerp(d, e);
  return {
    out: { duration: 280 * split.x, easing: `cubic-bezier(${a.x / split.x},${a.y / split.y},${d.x / split.x},${d.y / split.y})` },
    into: { duration: 280 * (1 - split.x), easing: `cubic-bezier(${(e.x - split.x) / (1 - split.x)},${(e.y - split.y) / (1 - split.y)},${(c.x - split.x) / (1 - split.x)},${(c.y - split.y) / (1 - split.y)})` },
  };
}

const decodedImages = new Map<string, Promise<void>>();

function prepareImages(sources: string[]) {
  return Promise.all([...new Set(sources)].map(src => {
    let ready = decodedImages.get(src);
    if (!ready) {
      const image = new Image();
      image.loading = "eager";
      image.src = src;
      ready = image.decode().catch(() => {
        // A failed photo must not prevent changing menus; allow a later retry.
        decodedImages.delete(src);
      });
      decodedImages.set(src, ready);
    }
    return ready;
  }));
}
