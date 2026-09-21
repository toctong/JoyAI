import { notFound } from "next/navigation";
import { AiToolDetail, getAiTool } from "@/features/ai-tools";

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getAiTool(slug);
  if (!tool) notFound();
  return <AiToolDetail tool={tool} />;
}
