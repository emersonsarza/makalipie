"use client";
import { createContext, useContext, useEffect } from "react";
export type EditState = { dirty: boolean; busy: boolean };
export const CatalogEditContext = createContext<((state: EditState) => void) | null>(null);
export function useCatalogEditState(dirty: boolean, busy: boolean) {
  const report = useContext(CatalogEditContext);
  useEffect(() => { report?.({ dirty, busy }); return () => report?.({ dirty: false, busy: false }); }, [report, dirty, busy]);
  return Boolean(report);
}
