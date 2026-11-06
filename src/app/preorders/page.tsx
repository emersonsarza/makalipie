import { permanentRedirect } from "next/navigation";
import { preorderMenuHref } from "@/lib/order-intent";

export default async function PreordersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(preorderMenuHref(await searchParams));
}
