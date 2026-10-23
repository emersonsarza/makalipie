"use client";
import { createContext, useContext } from "react";
import { defaultPublicShop, type PublicShop } from "@/lib/settings/schema";
const PublicShopContext = createContext<PublicShop>(defaultPublicShop);
export function PublicShopProvider({ value, children }: { value: PublicShop; children: React.ReactNode }) { return <PublicShopContext.Provider value={value}>{children}</PublicShopContext.Provider>; }
export function usePublicShop() { return useContext(PublicShopContext); }
export function ChatLinks() { const { links } = usePublicShop(); return <span><a href={links.instagramDm || links.instagram} target="_blank" rel="noreferrer">Instagram</a>{links.messenger && <> or <a href={links.messenger} target="_blank" rel="noreferrer">Messenger</a></>}</span>; }
