import { requireOwnerPage } from "@/lib/admin/session";
import { emptyOpsOverview, opsOverview } from "@/lib/admin/overview-fixtures";
import { OpsOverview } from "@/components/admin/ops-overview";

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  await requireOwnerPage();
  const { preview } = await searchParams;
  if (preview === "fixtures") {
    return <OpsOverview snapshot={opsOverview} fixturePreview />;
  }
  return <OpsOverview snapshot={emptyOpsOverview} />;
}
