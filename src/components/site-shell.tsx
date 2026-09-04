import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/lib/site";

type SiteShellProps = {
  children: React.ReactNode;
  showBanner?: boolean;
};

export function SiteShell({ children, showBanner = true }: SiteShellProps) {
  return (
    <div id="top" className="flex min-h-full flex-1 flex-col">
      {showBanner ? (
        <div className="bg-charcoal px-4 py-2 text-center text-sm text-cream">
          <p>
            Buko pie (bestseller) · Fri–Sun ·{" "}
            <a
              href={site.instagramDmUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-crust underline decoration-crust/70 underline-offset-2"
            >
              message us to order
            </a>
          </p>
        </div>
      ) : null}
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
