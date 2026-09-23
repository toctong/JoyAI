import { notFound } from "next/navigation";
import { getAiTool } from "@/features/ai-tools";
import { MobileToolDetailPage } from "@/features/mobile/mobile-tool-detail";

export default async function MobileToolDetailRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getAiTool(slug);
  if (!tool) notFound();
  return <MobileToolDetailPage tool={tool} />;
}
