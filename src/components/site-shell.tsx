import { ArrowUpRight } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/lib/site";

export function SiteShell({
  children,
  showBanner = true,
}: {
  children: React.ReactNode;
  showBanner?: boolean;
}) {
  return (
    <div id="top" className="flex min-h-full flex-1 flex-col">
      {showBanner && (
        <div className="announcement">
          A little weekend tradition. Buko pie, Friday to Sunday.
          <a href={site.instagramDmUrl} target="_blank" rel="noreferrer">
            Save me a pie <ArrowUpRight size={14} aria-hidden />
          </a>
        </div>
      )}
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
