import { resolveBranch, type CatalogMode } from "@/lib/branches/schema";
import { readPublicMenu } from "@/lib/products/public";
import { orderIntakeEnabled } from "@/lib/orders/schema";
import { readOrderingAvailability } from "@/lib/orders/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OrderForm } from "@/components/order-form";
import { SiteShell } from "@/components/site-shell";

export async function OrderScreen({ mode, searchParams }: { mode: CatalogMode; searchParams: Promise<{ branch?: string | string[] }> }) {
  const { items, addons, unavailable } = await readPublicMenu();
  let branches, schedule, openDates, openProducts;
  try {
    const availability = await readOrderingAvailability();
    branches = availability.branches;
    schedule = availability.schedule;
    openDates = availability.openDates;
    openProducts = availability.openProducts;
  } catch {
    return (
      <SiteShell>
        <section className="wrap section-space">
          <Alert>
            <AlertTitle>Ordering is temporarily unavailable.</AlertTitle>
            <AlertDescription>We couldn’t load ordering settings. Please try again shortly.</AlertDescription>
          </Alert>
        </section>
      </SiteShell>
    );
  }
  const initialBranch = resolveBranch((await searchParams).branch, branches);
  const orderable = items.filter((item) => item.variants?.some((v) => v.active));
  return (
    <SiteShell>
      {!unavailable ? (
        <OrderForm mode={mode} items={orderable} catalogAddons={addons} branches={branches} initialBranch={initialBranch} schedule={schedule} serverNow={new Date().toISOString()} openDates={openDates} openProducts={openProducts} intakeEnabled={orderIntakeEnabled()} />
      ) : (
        <section className="wrap section-space">
          <Alert>
            <AlertTitle>Our menu is being updated.</AlertTitle>
            <AlertDescription>
              We couldn’t load the menu right now. Please{" "}
              <a href="https://www.instagram.com/makalipie/">
                message us on Instagram
              </a>{" "}
              for help with your order.
            </AlertDescription>
          </Alert>
        </section>
      )}
    </SiteShell>
  );
}
