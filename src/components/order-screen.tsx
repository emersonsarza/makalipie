import { ChatLinks } from "@/components/public-shop-provider";
import { resolveBranch, type CatalogMode } from "@/lib/branches/schema";
import { staticBranchSettings, staticPublicMenu, staticSchedule } from "@/lib/public/static-shop";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OrderForm } from "@/components/order-form";
import { SiteShell } from "@/components/site-shell";

export async function OrderScreen({ mode, searchParams }: { mode: CatalogMode; searchParams: Promise<{ branch?: string | string[] }> }) {
  const { items, addons, unavailable, sections } = staticPublicMenu();
  const branches = staticBranchSettings();
  const schedule = staticSchedule();
  const initialBranch = resolveBranch((await searchParams).branch, branches);
  const orderable = items.filter((item) => item.variants?.some((v) => v.active));
  return (
    <SiteShell>
      {!unavailable ? (
        <OrderForm mode={mode} items={orderable} sections={sections} catalogAddons={addons} branches={branches} initialBranch={initialBranch} schedule={schedule} serverNow={new Date().toISOString()} intakeEnabled={false} />
      ) : (
        <section className="wrap section-space">
          <Alert>
            <AlertTitle>Our menu is being updated.</AlertTitle>
            <AlertDescription>
              We couldn’t load the menu right now. Please{" "}
              <ChatLinks />{" "}
              for help with your order.
            </AlertDescription>
          </Alert>
        </section>
      )}
    </SiteShell>
  );
}
