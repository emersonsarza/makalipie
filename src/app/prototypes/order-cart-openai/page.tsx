import type { Metadata } from "next";
import { readPublicMenu } from "@/lib/products/public";
import { CartHarness } from "./harness";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cart explorations · Makalipie",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const { catalog, unavailable } = await readPublicMenu();
  return <CartHarness catalog={catalog} unavailable={unavailable} />;
}
