"use client";
import { createContext, useContext } from "react";
import { defaultPublicShop, type PublicShop } from "@/lib/settings/schema";
import type { DropSummary } from "@/lib/public/checkout";
import type { PublicLocations } from "@/lib/popups/locations";
import type { BranchRecord } from "@/lib/branches/schema";
import type { PublicExperience } from "@/components/customer-policy";
export type PublicShopView = PublicShop & { branches?: BranchRecord[]; locations?: PublicLocations; upcomingDrops?: DropSummary[]; experience?: PublicExperience };
const PublicShopContext = createContext<PublicShopView>(defaultPublicShop);
export function PublicShopProvider({ value, children }: { value: PublicShopView; children: React.ReactNode }) { return <PublicShopContext.Provider value={value}>{children}</PublicShopContext.Provider>; }
export function usePublicShop() { return useContext(PublicShopContext); }
export function ChatLinks() {
  const { links } = usePublicShop();
  const instagram = links.instagramDm || links.instagram;
  if (!instagram && !links.messenger) return <span>our shop</span>;
  return <span>
    {instagram && <a href={instagram} target="_blank" rel="noreferrer">Instagram</a>}
    {instagram && links.messenger && " or "}
    {links.messenger && <a href={links.messenger} target="_blank" rel="noreferrer">{links.messenger.includes("facebook.com") ? "Facebook" : "Messenger"}</a>}
  </span>;
}
