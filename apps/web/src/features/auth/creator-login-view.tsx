"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api, ApiError } from "@/shared/lib/api";
import { useAuthStore, type AuthUser } from "@/shared/lib/auth-store";
import {
  getViewPreferenceFromCookieHeader,
  homePathForDevice,
} from "@/shared/lib/device";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import "./auth-login.css";

/**
 * Placeholder WorkRally CDN shots — swap anytime (local / TOS later).
 * Hero keeps FrameRally login stage video; story/cards use CDN placeholders.
 */
const LOGIN_MEDIA = {
  hero: "https://ai-video-e1.tos-cn-beijing.volces.com/ai-video/login/login.mp4",
  story: "https://zenvideo.gtimg.com/anime/dist/static/shot-06.2320766c.mp4",
  cards: [
    "https://zenvideo.gtimg.com/anime/dist/static/layout-engine.570c5bf2.mp4",
    "https://zenvideo.gtimg.com/anime/dist/static/model-3d.4b55c6c4.mp4",
    "https://zenvideo.gtimg.com/anime/dist/static/relight.f9eb1ac4.mp4",
    "https://zenvideo.gtimg.com/anime/dist/static/shot-02.dc356f4b.mp4",
  ],
  slogan: "https://zenvideo.gtimg.com/anime/dist/static/shot-01.13d22be2.mp4",
} as const;

const NAV_LINKS = [
  { id: "script", label: "剧本创作" },
  { id: "batch", label: "批量制作" },
  { id: "batch", label: "无限画布" },
] as const;

const EDITIONS = [
  {
    id: "explore",
    label: "AI work探索版",
    caption:
      "/探索开场/ 电影级氛围，写实摄影融合绘画质感，冷暖交界处留白，主体清晰，画面干净有张力。",
  },
  {
    id: "animation",
    label: "精品动画版",
    caption:
      "/精品动画/ 柔和主光、丰富中间调，故事板英雄帧，细节完整，适合连续分镜叙事。",
  },
  {
    id: "film",
    label: "专业影视版",
    caption:
      "/专业影视/ 变形镜头景深、受控调色、制作级情绪，适合成片级镜头语言。",
  },
] as const;

const FEATURE_CARDS = [
  {
    title: "专家级 导演 Agent",
    desc: "零门槛上手，自然语言驱动，一句话召唤你的 AI 导演。",
    tags: ["剧情镜头专家", "武打技术专家", "情绪表现专家"],
    tone: "a",
    video: LOGIN_MEDIA.cards[0],
  },
  {
    title: "大师级 影视 Skill",
    desc: "创意描述、角色形象、故事脉络，一键推进生成链路。",
    tags: ["创意描述", "角色形象", "故事脉络", "一键生成"],
    tone: "b",
    video: LOGIN_MEDIA.cards[1],
  },
  {
    title: "无限画布编排",
    desc: "节点、素材与分镜铺在同一平面，自由连接创作节奏。",
    tags: ["节点编排", "素材沉淀", "分镜串联"],
    tone: "c",
    video: LOGIN_MEDIA.cards[2],
  },
  {
    title: "批量制作引擎",
    desc: "角色、场景、镜头批量出图出片，把产能拉满。",
    tags: ["批量出图", "批量出片", "资产复用"],
    tone: "d",
    video: LOGIN_MEDIA.cards[3],
  },
] as const;

const schema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(4, "密码至少 4 位"),
});

type FormValues = z.infer<typeof schema>;
type EditionId = (typeof EDITIONS)[number]["id"];

function LoopVideo({
  src,
  className,
  poster,
}: {
  src: string;
  className?: string;
  poster?: string;
}) {
  return (
    <video
      className={className}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      controlsList="nodownload nofullscreen noremoteplayback"
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

function SloganSection({
  scrollerRef,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const root = scrollerRef.current;
    if (!section) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      {
        root: root ?? null,
        threshold: 0.35,
      },
    );
    io.observe(section);
    return () => io.disconnect();
  }, [scrollerRef]);

  return (
    <section
      ref={sectionRef}
      className={cn("login-page__slogan", inView && "is-in")}
      id="script"
    >
      <div className="login-page__slogan-stage" aria-hidden>
        <LoopVideo
          className="login-page__slogan-video"
          src={LOGIN_MEDIA.slogan}
        />
        <div className="login-page__slogan-veil" />
      </div>
      <div className="login-page__slogan-content">
        <h2>
          让灵感，
          <br />
          肆意绽放。
        </h2>
      </div>
    </section>
  );
}

function FeatureStrip({
  scrollerRef,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const total = FEATURE_CARDS.length;
  const active = FEATURE_CARDS[selected] ?? FEATURE_CARDS[0]!;
  const frameLabel = `${String(selected + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  useEffect(() => {
    const root = scrollerRef.current;
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!root || !section || !track) return;

    const sync = () => {
      const travel = Math.max(1, section.offsetHeight - root.clientHeight);
      const local = root.scrollTop - section.offsetTop;
      const progress = Math.min(1, Math.max(0, local / travel));

      // Continuous strip travel; discrete copy/active frame.
      const first = track.children[0] as HTMLElement | undefined;
      const gap = Number.parseFloat(getComputedStyle(track).gap || "0") || 0;
      const step = first ? first.offsetWidth + gap : 0;
      const floatIndex = progress * Math.max(0, total - 1);
      track.style.transform = `translate3d(${-floatIndex * step}px, 0, 0)`;

      const idx = Math.min(total - 1, Math.round(floatIndex));
      setSelected((prev) => (prev === idx ? prev : idx));
    };

    sync();
    root.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      root.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [scrollerRef, total]);

  function jumpToFrame(index: number) {
    const root = scrollerRef.current;
    const section = sectionRef.current;
    if (!root || !section) return;
    const travel = Math.max(1, section.offsetHeight - root.clientHeight);
    const target =
      section.offsetTop +
      (Math.min(total - 1, Math.max(0, index)) / Math.max(1, total - 1)) *
        travel;
    root.scrollTo({ top: target, behavior: "smooth" });
  }

  return (
    <section
      ref={sectionRef}
      className="login-page__features"
      id="batch"
      style={{ "--feature-frames": total } as CSSProperties}
    >
      <div className="login-page__feature-pin">
        <div className="login-page__feature-world" aria-hidden>
          <div ref={trackRef} className="login-page__feature-track">
            {FEATURE_CARDS.map((card, index) => (
              <div
                key={card.title}
                className={cn(
                  "login-page__feature-panel",
                  selected === index && "is-active",
                )}
              >
                <LoopVideo
                  className="login-page__feature-video"
                  src={card.video}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="login-page__feature-strip" aria-label="能力定格">
          <div
            key={active.title}
            className="login-page__feature-frame-copy"
          >
            <h3>{active.title}</h3>
            <p>{active.desc}</p>
            <div className="login-page__feature-tags">
              {active.tags.map((tag, i) => (
                <span
                  key={tag}
                  className={cn(i === active.tags.length - 1 && "is-accent")}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="login-page__feature-pager" aria-live="polite">
            <span className="login-page__feature-pager-label">{frameLabel}</span>
            <div className="login-page__feature-pager-dots" role="tablist">
              {FEATURE_CARDS.map((card, index) => (
                <button
                  key={card.title}
                  type="button"
                  role="tab"
                  aria-label={`第 ${index + 1} 帧`}
                  aria-selected={selected === index}
                  className={cn(
                    "login-page__feature-pager-dot",
                    selected === index && "is-active",
                  )}
                  onClick={() => jumpToFrame(index)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CreatorLoginView() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [hydrated, setHydrated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [keepLogin, setKeepLogin] = useState(true);
  const [agreed, setAgreed] = useState(true);
  const [loginTab, setLoginTab] = useState<"password" | "code" | "wechat">(
    "password",
  );
  const [agreement, setAgreement] = useState<"user" | "privacy" | null>(null);
  const [totpChallenge, setTotpChallenge] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpUser, setTotpUser] = useState<string | null>(null);
  const [edition, setEdition] = useState<EditionId>("explore");

  const activeEdition =
    EDITIONS.find((item) => item.id === edition) ?? EDITIONS[0]!;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  function postLoginHome() {
    return homePathForDevice({
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      viewPref: getViewPreferenceFromCookieHeader(
        typeof document !== "undefined" ? document.cookie : "",
      ),
    });
  }

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && token) router.replace(postLoginHome());
  }, [hydrated, token, router]);

  function openLogin() {
    setLoginOpen(true);
  }

  function closeLogin(open: boolean) {
    setLoginOpen(open);
    if (!open) {
      setTotpChallenge(null);
      setTotpCode("");
      setShowPassword(false);
    }
  }

  function scrollToId(id: string) {
    const root = scrollerRef.current;
    const el = document.getElementById(id);
    if (!root || !el) return;
    const top =
      el.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop;
    root.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
  }

  async function onSubmit(values: FormValues) {
    if (!agreed) {
      toast.error("请先阅读并同意用户服务协议与隐私政策");
      return;
    }
    try {
      const res = await api<{
        requiresTotp?: boolean;
        challengeToken?: string;
        accessToken?: string;
        user: AuthUser & { username: string };
      }>("/auth/login", {
        method: "POST",
        body: values,
        token: null,
      });

      if (res.requiresTotp && res.challengeToken) {
        setTotpChallenge(res.challengeToken);
        setTotpUser(res.user.username);
        setTotpCode("");
        toast.success("请输入身份验证器验证码");
        return;
      }

      if (!res.accessToken) {
        toast.error("登录响应异常");
        return;
      }
      setAuth(res.accessToken, res.user);
      toast.success("登录成功");
      router.replace(postLoginHome());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "操作失败");
    }
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!totpChallenge) return;
    if (totpCode.trim().length < 6) {
      toast.error("请输入 6 位验证码");
      return;
    }
    try {
      const res = await api<{ accessToken: string; user: AuthUser }>(
        "/auth/login/totp",
        {
          method: "POST",
          body: { challengeToken: totpChallenge, code: totpCode.trim() },
          token: null,
        },
      );
      setAuth(res.accessToken, res.user);
      setTotpChallenge(null);
      toast.success("登录成功");
      router.replace(postLoginHome());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "验证失败");
    }
  }

  return (
    <div
      ref={scrollerRef}
      className="login-page"
      aria-label="FrameRally 开场"
    >
      <header className="login-page__nav">
        <div className="login-page__brand-lockup">
          <Link
            href="/frame-rally"
            className="login-page__logo"
            aria-label="FrameRally"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={JOYAI_BRAND.wordmark}
              alt="FrameRally"
              className="login-page__wordmark"
              draggable={false}
            />
          </Link>
          <span className="login-page__edition-tag">{activeEdition.label}</span>
        </div>

        <nav className="login-page__links" aria-label="产品能力">
          {NAV_LINKS.map((item) => (
            <button
              key={item.label}
              type="button"
              className="login-page__link"
              onClick={() => scrollToId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button type="button" className="login-page__cta" onClick={openLogin}>
          进入{activeEdition.label}
          <ArrowRight className="size-4" strokeWidth={1.75} />
        </button>
      </header>

      {/* 01 Hero — full viewport, free scroll continues below */}
      <section className="login-page__hero" id="hero">
        <div className="login-page__stage" aria-hidden>
          <LoopVideo
            className="login-page__video"
            src={LOGIN_MEDIA.hero}
            poster={JOYAI_BRAND.heroBg}
          />
          <div className="login-page__veil" />
        </div>

        <div className="login-page__hero-center">
          <div className="login-page__hero-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={JOYAI_BRAND.wordmark}
              alt="FrameRally"
              className="login-page__hero-wordmark"
              draggable={false}
            />
            <p className="login-page__hero-sub">{activeEdition.label}</p>
          </div>
          <p key={activeEdition.id} className="login-page__prompt">
            {activeEdition.caption}
          </p>
        </div>

        <div className="login-page__hero-bottom">
          <div
            className="login-page__tabs"
            role="tablist"
            aria-label="产品版本"
          >
            {EDITIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={edition === item.id}
                className={cn(
                  "login-page__tab",
                  edition === item.id && "is-active",
                )}
                onClick={() => setEdition(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="login-page__scroll"
            onClick={() => scrollToId("story")}
          >
            <span>SCROLL</span>
            <ChevronDown className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </section>

      {/* 02 Story */}
      <section className="login-page__story" id="story">
        <div className="login-page__story-copy">
          <p className="login-page__story-kicker">STORY → CUT</p>
          <h2 className="login-page__story-title">
            你只管说出故事，
            <br />
            精品自然生长。
          </h2>
        </div>
        <div className="login-page__story-stage" aria-hidden>
          <div className="login-page__story-glow" />
          <div className="login-page__story-art">
            <LoopVideo
              className="login-page__story-video"
              src={LOGIN_MEDIA.story}
            />
            <div className="login-page__story-meta">
              <span>A001_C012 · FRAMERALLY</span>
              <span>TC 00:00:00:00</span>
            </div>
          </div>
        </div>
      </section>

      {/* 03 Feature frames — scroll-driven stop-motion */}
      <FeatureStrip scrollerRef={scrollerRef} />

      {/* 04 Slogan */}
      <SloganSection scrollerRef={scrollerRef} />

      <Dialog open={loginOpen} onOpenChange={closeLogin}>
        <DialogContent className="login-modal">
          <div className="login-modal__brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={JOYAI_BRAND.wordmarkDark}
              alt="FrameRally"
              className="login-modal__brand-wordmark"
              draggable={false}
            />
            <span className="login-modal__brand-edition">
              {activeEdition.label}
            </span>
          </div>

          {!totpChallenge ? (
            <div className="login-modal__tabs" role="tablist" aria-label="登录方式">
              {(
                [
                  { id: "wechat", label: "微信登录" },
                  { id: "code", label: "验证码登录" },
                  { id: "password", label: "密码登录" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={loginTab === tab.id}
                  className={cn(
                    "login-modal__tab",
                    loginTab === tab.id && "is-active",
                  )}
                  onClick={() => {
                    if (tab.id !== "password") {
                      toast.message("该登录方式即将开放");
                      return;
                    }
                    setLoginTab("password");
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <DialogHeader className="login-modal__head">
            <DialogTitle
              className={cn(
                "login-modal__title",
                !totpChallenge && "sr-only",
              )}
            >
              {totpChallenge ? "身份验证" : "登录 FrameRally"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {totpChallenge
                ? `请输入 ${totpUser ?? ""} 的动态验证码`
                : `进入${activeEdition.label}，继续你的创作`}
            </DialogDescription>
          </DialogHeader>

          {totpChallenge ? (
            <form className="login-modal__fields" onSubmit={onTotpSubmit}>
              <label className="login-modal__field">
                <input
                  className="login-modal__input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="请输入 6 位验证码"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) =>
                    setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </label>
              <button type="submit" className="login-modal__submit">
                验证并登录
              </button>
              <button
                type="button"
                className="login-modal__ghost"
                onClick={() => {
                  setTotpChallenge(null);
                  setTotpCode("");
                }}
              >
                返回密码登录
              </button>
            </form>
          ) : (
            <>
              <form
                className="login-modal__fields"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <label className="login-modal__field">
                  <input
                    className="login-modal__input"
                    autoComplete="username"
                    placeholder="请输入用户名"
                    maxLength={64}
                    {...form.register("username")}
                  />
                </label>
                <label className="login-modal__field">
                  <input
                    className="login-modal__input"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="请输入密码"
                    maxLength={64}
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    className="login-modal__eye"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </label>

                <div className="login-modal__row">
                  <label className="login-modal__check">
                    <input
                      type="checkbox"
                      checked={keepLogin}
                      onChange={(e) => setKeepLogin(e.target.checked)}
                    />
                    <span>保持登录</span>
                  </label>
                  <button
                    type="button"
                    className="login-modal__link"
                    onClick={() => toast.message("请联系管理员重置密码")}
                  >
                    忘记密码?
                  </button>
                </div>

                <button
                  type="submit"
                  className="login-modal__submit"
                  disabled={form.formState.isSubmitting || !agreed}
                >
                  {form.formState.isSubmitting ? "登录中..." : "立即登录"}
                </button>
              </form>

              <div className="login-modal__alt">
                <p className="login-modal__alt-label">使用其他方式登录</p>
                <div className="login-modal__alt-icons">
                  {(
                    [
                      {
                        id: "wechat",
                        label: "微信",
                        src: "/icons/auth/wechat.svg",
                      },
                      { id: "qq", label: "QQ", src: "/icons/auth/qq.svg" },
                      {
                        id: "douyin",
                        label: "抖音",
                        src: "/icons/auth/douyin.svg",
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="login-modal__alt-btn"
                      aria-label={item.label}
                      onClick={() =>
                        toast.message(`${item.label}登录即将开放`)
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.src} alt="" draggable={false} />
                    </button>
                  ))}
                </div>
              </div>

              <label className="login-modal__agree">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  我已阅读并同意 FrameRally
                  <button
                    type="button"
                    className="login-modal__text-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      setAgreement("user");
                    }}
                  >
                    用户服务协议
                  </button>
                  和
                  <button
                    type="button"
                    className="login-modal__text-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      setAgreement("privacy");
                    }}
                  >
                    隐私政策
                  </button>
                </span>
              </label>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={agreement !== null}
        onOpenChange={(open) => !open && setAgreement(null)}
      >
        <DialogContent className="login-modal login-modal--legal">
          <DialogHeader>
            <DialogTitle className="login-modal__title">
              {agreement === "user" ? "用户协议" : "隐私政策"}
            </DialogTitle>
          </DialogHeader>
          <p className="login-modal__legal">
            {agreement === "user"
              ? "使用本平台即表示你同意遵守内容创作规范，不得利用生成能力制作违法违规内容。正式协议文本将在上线前更新。"
              : "我们仅在提供服务所必需的范围内处理账号与创作数据，不会出售你的个人信息。正式隐私政策将在上线前更新。"}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
