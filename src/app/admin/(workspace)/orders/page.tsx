import { OrdersWorkspace } from "@/components/admin/orders-workspace";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  const { order } = await searchParams;
  return <OrdersWorkspace directOrderId={typeof order === "string" ? order : undefined} />;
}
