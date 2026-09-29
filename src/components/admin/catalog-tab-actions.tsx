"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function CatalogTabActions({ active, children }: { active: boolean; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setHost(active ? document.getElementById("catalog-tab-actions") : null);
  }, [active]);
  const actions = <div className="product-save-actions">{children}</div>;
  return host ? createPortal(actions, host) : actions;
}
