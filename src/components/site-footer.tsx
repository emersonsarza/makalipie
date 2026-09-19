import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="brand-footer">
      <div className="wrap">
        <div className="footer-top">
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
        </div>
        <div className="footer-links">
          <Link href="/" className="footer-brand" aria-label="Makalipie home">
            <Image
              src="/brand/seal.png"
              alt="Makalipie Tarts & Pies"
              width={90}
              height={90}
            />
          </Link>
          <div>
            <p className="eyebrow">COME BY</p>
            <p>
              2nd Floor, Streetscape, Banilad
              <br />
              Cebu City · Daily, 10am to 8pm
            </p>
            <a href={site.mapsUrl} target="_blank" rel="noreferrer">
              Get directions <ArrowUpRight size={14} aria-hidden />
            </a>
          </div>
          <div>
            <p className="eyebrow">TAKE A LOOK</p>
            <Link href="/menu">Our pies</Link>
            <Link href="/#story">Our story</Link>
            <Link href="/order">Order a pie</Link>
          </div>
          <div>
            <p className="eyebrow">SAY HELLO</p>
            <a href={site.instagramUrl} target="_blank" rel="noreferrer">
              @makalipie <ArrowUpRight size={14} aria-hidden />
            </a>
            <a href={site.instagramDmUrl} target="_blank" rel="noreferrer">
              Gifts & gatherings <ArrowUpRight size={14} aria-hidden />
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Makalipie</span>
          <span>Making people happy, one pie at a time.</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </div>
    </footer>
  );
}
