"use client";
import { createContext, useContext } from "react";
import { defaultPublicShop, type PublicShop } from "@/lib/settings/schema";
import type { PublicLocations } from "@/lib/popups/locations";
import type { BranchRecord } from "@/lib/branches/schema";
import type { PublicExperience } from "@/components/customer-policy";
export type PublicShopView = PublicShop & { branches?: BranchRecord[]; locations?: PublicLocations; experience?: PublicExperience };
const PublicShopContext = createContext<PublicShopView>(defaultPublicShop);
export function PublicShopProvider({ value, children }: { value: PublicShopView; children: React.ReactNode }) { return <PublicShopContext.Provider value={value}>{children}</PublicShopContext.Provider>; }
export function usePublicShop() { return useContext(PublicShopContext); }
export function ChatLinks() { const { links } = usePublicShop(); return <span><a href={links.instagramDm || links.instagram} target="_blank" rel="noreferrer">Instagram</a>{links.messenger && <> or <a href={links.messenger} target="_blank" rel="noreferrer">{links.messenger.includes("facebook.com")?"Facebook":"Messenger"}</a></>}</span>; }
