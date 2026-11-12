import { DropPreview } from "@/components/admin/drops/drop-preview";

export default async function DropPreviewPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  return <DropPreview slug={typeof slug === "string" ? slug : ""} />;
}
