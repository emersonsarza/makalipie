"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BottomCart } from "./bottom";
import { SideCart } from "./side";
import { DockedCart } from "./docked";
import "./order-cart.css";

const VARIANTS = [
  { name: "Bottom", render: () => <BottomCart /> },
  { name: "Side", render: () => <SideCart /> },
  { name: "Docked", render: () => <DockedCart /> },
] as const;

function Harness() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = Math.min(Math.max((Number(searchParams.get("v")) || 1) - 1, 0), VARIANTS.length - 1);
  const [index, setIndex] = useState(initial);
  const [mountKey, setMountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const moveHighlight = useCallback(() => {
    const el = itemRefs.current[index];
    const highlight = highlightRef.current;
    if (!el || !highlight) return;
    highlight.style.width = `${el.offsetWidth}px`;
    highlight.style.transform = `translateX(${el.offsetLeft}px)`;
  }, [index]);

  const setActive = useCallback(
    (next: number) => {
      if (next < 0 || next >= VARIANTS.length) return;
      setIndex(next);
      setMountKey((k) => k + 1);
      const url = new URL(window.location.href);
      url.searchParams.set("v", String(next + 1));
      router.replace(`${pathname}${url.search}`, { scroll: false });
    },
    [pathname, router],
  );

  const replay = useCallback(() => setMountKey((k) => k + 1), []);

  useLayoutEffect(() => {
    moveHighlight();
  }, [moveHighlight, mountKey]);

  useEffect(() => {
    const onResize = () => moveHighlight();
    window.addEventListener("resize", onResize);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReady(true));
    });
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(id);
    };
  }, [moveHighlight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= VARIANTS.length) setActive(num - 1);
      else if (e.key === "ArrowRight") setActive((index + 1) % VARIANTS.length);
      else if (e.key === "ArrowLeft") setActive((index - 1 + VARIANTS.length) % VARIANTS.length);
      else if (e.key === "r" || e.key === "R") replay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, replay, setActive]);

  const Active = VARIANTS[index].render;

  return (
    <>
      <div key={`${index}-${mountKey}`}>
        <Active />
      </div>
      <nav
        className="proto-picker"
        aria-label="Prototype variants"
        data-position="top"
        data-ready={ready ? "" : undefined}
      >
        <span className="proto-picker-highlight" aria-hidden ref={highlightRef} />
        {VARIANTS.map((variant, i) => (
          <button
            key={variant.name}
            type="button"
            className="proto-picker-item"
            data-active={i === index ? "" : undefined}
            aria-current={i === index ? "true" : undefined}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            onClick={() => setActive(i)}
          >
            {variant.name}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden />
        <button
          type="button"
          className="proto-picker-item proto-picker-replay"
          aria-label="Replay animation (R)"
          onClick={replay}
        >
          ↻
        </button>
      </nav>
    </>
  );
}

export default function OrderCartPrototypePage() {
  return (
    <Suspense fallback={<div className="oc-root" style={{ minHeight: "100dvh" }} />}>
      <Harness />
    </Suspense>
  );
}
