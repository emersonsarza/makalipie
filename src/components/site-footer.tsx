"use client";
import { ThemeSwitch } from "@/components/site-theme";
import { VisibleBranches } from "@/components/customer-policy";
import { usePublicShop } from "@/components/public-shop-provider";
import { ArrowUpRight } from "lucide-react";
import { BrandSeal } from "@/components/brand-seal";
import { ThemeLink as Link } from "@/components/site-theme";

export function SiteFooter({ showCta = true }: { showCta?: boolean }) {
  const shop = usePublicShop();
  return (
    <footer className="brand-footer">
      <div className="wrap">
        {showCta && <div className="footer-top">
          <div>
            <p className="eyebrow">MADE IN CEBU. MEANT TO BE SHARED.</p>
            <h2>
              A little happiness
              <br />
              goes a long way.
            </h2>
          </div>
          <Link href="/order" className="brand-button">
            Bring home a pie <ArrowUpRight size={18} aria-hidden />
          </Link>
        </div>}
        <div className="footer-links">
          <Link href="/" className="footer-brand" aria-label="Makalipie home">
            <BrandSeal alt="Makalipie Tarts & Pies" width={90} height={90} />
          </Link>
          <div>
            <p className="eyebrow">COME BY</p>
            <VisibleBranches />
          </div>
          <div>
            <p className="eyebrow">TAKE A LOOK</p>
            <Link href="/menu">Our pies</Link>
            <Link href="/#story">Our story</Link>
            <Link href="/order">Order a pie</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund">Refund policy</Link>
          </div>
          <div>
            <p className="eyebrow">SAY HELLO</p>
            {shop.links.messenger && <a href={shop.links.messenger} target="_blank" rel="noreferrer">{shop.links.messenger.includes("facebook.com")?"Facebook":"Messenger"} <ArrowUpRight size={14} aria-hidden /></a>}
            <a href={shop.links.instagram} target="_blank" rel="noreferrer">
              @makalipie <ArrowUpRight size={14} aria-hidden />
            </a>
            <a href={shop.links.instagramDm} target="_blank" rel="noreferrer">
              Gifts & gatherings <ArrowUpRight size={14} aria-hidden />
            </a>
            <a href={shop.links.grabFood} target="_blank" rel="noreferrer">
              Order on Grab <ArrowUpRight size={14} aria-hidden />
            </a>
            <a href={shop.links.foodpanda} target="_blank" rel="noreferrer">
              Order on Foodpanda <ArrowUpRight size={14} aria-hidden />
            </a>
          </div>
        </div>
        <ThemeSwitch />
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Makalipie</span>
          <span>Making people happy, one pie at a time.</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </div>
    </footer>
  );
}
