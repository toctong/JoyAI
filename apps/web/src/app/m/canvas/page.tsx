import { MobilePlaceholderPage } from "@/features/mobile";

export default function MobileCanvasPage() {
  return (
    <MobilePlaceholderPage
      title="画布"
      description="无限画布编辑器请使用电脑版。手机端后续会提供项目列表与只读预览。"
      hints={["点右上角「电脑版」可打开完整画布"]}
    />
  );
}
