"use client";

import { useEffect, useRef, useState } from "react";

/** Wide admin keeps a side-by-side list and detail. Narrow screens show the list first. */
export function useWideAdmin() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1100px)");
    const apply = () => setWide(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return wide;
}

export function useOpenFirst<T>({ items, selected, hold, ready, onOpen }: {
  items: T[];
  selected: boolean;
  hold: boolean;
  ready: boolean;
  onOpen: (item: T) => void;
}) {
  const wide = useWideAdmin();
  const onOpenRef = useRef(onOpen);
  const first = items[0];
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    if (wide !== true || !ready || hold || selected || !first) return;
    onOpenRef.current(first);
  }, [wide, ready, hold, selected, first]);
  return wide;
}
