import type { ManjuStepId } from "../config/manju-steps";
import type { ManjuProjectDraft } from "../manju-types";

export type ManjuFlowIntent =
  | "next"
  | "go-script"
  | "go-assets"
  | "go-prompts"
  | "confirm-script"
  | "focus-plan"
  | "focus-generate"
  | "focus-prompts"
  | "noop";

export type ManjuFlowGuide = {
  title: string;
  detail: string;
  cta: string;
  intent: ManjuFlowIntent;
  /** 本步已完成，可点右上角下一步 */
  readyForNext?: boolean;
};

/** 当前步骤里「该点哪个」——内容区引导用，文案面向用户 */
export function getStepFlowGuide(
  step: ManjuStepId,
  project: ManjuProjectDraft,
  opts?: { view?: string | null },
): ManjuFlowGuide {
  switch (step) {
    case "script": {
      if (project.scriptText.trim().length < 10) {
        return {
          title: "先放进剧本",
          detail: "粘贴、导入，或用「AI 帮写」生成一段可拍的原文。",
          cta: "知道了",
          intent: "noop",
        };
      }
      if (project.assets.length === 0) {
        return {
          title: "用 AI 分析剧本",
          detail: "点本页「AI 分析」，自动登记角色、场景、道具和分集。",
          cta: "知道了",
          intent: "noop",
        };
      }
      return {
        title: "剧本已就绪",
        detail: "可继续改原文，或点右上角「下一步」去视频设定。",
        cta: "下一步：视频设定",
        intent: "next",
        readyForNext: true,
      };
    }
    case "video-settings":
      return {
        title: "确认画幅与风格",
        detail: "选好比例、风格、时长和生成模式，再进资产出图。",
        cta: "下一步：场景角色道具",
        intent: "next",
        readyForNext: Boolean(project.settings.style.trim()),
      };
    case "assets": {
      if (project.assets.length === 0) {
        return {
          title: "还没有资产",
          detail: "回剧本步点「AI 分析」，或在本页点「新增」手动加。",
          cta: "回剧本分析",
          intent: "go-script",
        };
      }
      if (!project.assets.some((a) => a.imageUrl)) {
        return {
          title: "生出参考图",
          detail:
            "点下方「开始生成」批量出图，或单卡「生成 / 上传」。至少一张图才能进分镜。",
          cta: "去点开始生成",
          intent: "focus-generate",
        };
      }
      return {
        title: "资产已齐",
        detail: "可继续补图，或进入分镜脚本（会自动帮你规划分镜）。",
        cta: "下一步：分镜脚本",
        intent: "next",
        readyForNext: true,
      };
    }
    case "storyboard-script": {
      if (project.shots.length === 0) {
        return {
          title: "先规划分镜",
          detail: "点下方「规划分镜」让 AI 拆镜头；也可「新增」自己填。",
          cta: "去点规划分镜",
          intent: "focus-plan",
        };
      }
      if (!project.scriptConfirmed) {
        return {
          title: "确认脚本",
          detail:
            "检查画面与对白无误后，点「确认脚本」。确认后才能写提示词、进视频。",
          cta: "确认脚本",
          intent: "confirm-script",
        };
      }
      if (
        project.shots.some(
          (s) => !s.imagePrompt?.trim() || !s.videoPrompt?.trim(),
        )
      ) {
        if (opts?.view === "prompts") {
          return {
            title: "编写提示词",
            detail: "点本页「AI 编写全部提示词」，只补画面/视频词，不改对白。",
            cta: "去点 AI 编写",
            intent: "focus-prompts",
          };
        }
        return {
          title: "编写提示词",
          detail: "切到「提示词」页，点「AI 编写全部提示词」。",
          cta: "去写提示词",
          intent: "go-prompts",
        };
      }
      if (!project.shots.some((s) => s.storyboardImageUrl)) {
        return {
          title: "生成分镜图",
          detail: "回到「分镜」页点「开始生成」，按提示词出静帧。",
          cta: "去点开始生成",
          intent: "focus-generate",
        };
      }
      return {
        title: "分镜已就绪",
        detail: "可继续改图，或进入分镜视频。",
        cta: "下一步：分镜视频",
        intent: "next",
        readyForNext: true,
      };
    }
    case "storyboard-video": {
      if (!project.shots.some((s) => s.videoUrl)) {
        return {
          title: "生成镜头视频",
          detail:
            "点「开始生成」批量出视频；缺分镜图的镜头在图生视频模式下会跳过。",
          cta: "去点开始生成",
          intent: "focus-generate",
        };
      }
      return {
        title: "视频已就绪",
        detail: "可单镜重生成，或进入预览导出。",
        cta: "下一步：视频预览",
        intent: "next",
        readyForNext: true,
      };
    }
    case "preview":
      return {
        title: "预览与导出",
        detail: "连播检查成片；可打包 ZIP、导出 MP4，或推送到画布。",
        cta: "知道了",
        intent: "noop",
        readyForNext: true,
      };
    default:
      return {
        title: "继续创作",
        detail: "按页面提示完成当前步骤。",
        cta: "知道了",
        intent: "noop",
      };
  }
}
