"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api, ApiError } from "@/shared/lib/api";
import { useAuthStore, type AuthUser } from "@/shared/lib/auth-store";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import "./auth-login.css";

const LOGIN_VIDEO =
  "https://ai-video-e1.tos-cn-beijing.volces.com/ai-video/login/login.mp4";

const schema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(4, "密码至少 4 位"),
});

type FormValues = z.infer<typeof schema>;

function LoginStars() {
  const dots = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: `${(i * 37) % 100}%`,
        top: `${(i * 53) % 100}%`,
        delay: `${(i % 7) * 0.35}s`,
        size: i % 3 === 0 ? 2.5 : 1.5,
      })),
    [],
  );

  return (
    <div className="login-page__stars" aria-hidden>
      {dots.map((dot) => (
        <span
          key={dot.id}
          className="login-page__star"
          style={{
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            animationDelay: dot.delay,
          }}
        />
      ))}
    </div>
  );
}

export function CreatorLoginView() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [hydrated, setHydrated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [compact, setCompact] = useState(false);
  const [mediaWidth, setMediaWidth] = useState<number | null>(null);
  const [agreement, setAgreement] = useState<"user" | "privacy" | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && token) router.replace("/inspire");
  }, [hydrated, token, router]);

  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      if (w < 900) {
        setCompact(true);
        setMediaWidth(0);
        return;
      }
      setCompact(false);
      const ratio = 1920 / 1080;
      const ideal = Math.round(window.innerHeight * ratio);
      setMediaWidth(Math.min(ideal, w - 520));
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  async function onSubmit(values: FormValues) {
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const res = await api<{ accessToken: string; user: AuthUser }>(path, {
        method: "POST",
        body: values,
        token: null,
      });
      setAuth(res.accessToken, res.user);
      toast.success(mode === "login" ? "登录成功" : "注册成功");
      router.replace("/inspire");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "操作失败");
    }
  }

  return (
    <div className={`login-page${compact ? " login-page--compact" : ""}`}>
      {!compact ? (
        <div
          className="login-page__media"
          style={mediaWidth ? { width: mediaWidth, flex: "none" } : undefined}
        >
          <video
            className="login-page__video"
            src={LOGIN_VIDEO}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="login-page__media-fade" aria-hidden />
        </div>
      ) : null}

      <div className="login-page__panel">
        <div className="login-page__theme">
          <ThemeToggle />
        </div>
        <LoginStars />
        <div className="login-page__form">
          <div className="login-page__brand">
            <Link
              href="/inspire"
              className="login-page__logo-link"
              aria-label="JoyAI"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={JOYAI_BRAND.logoFull}
                alt="JoyAI"
                className="login-page__logo-img login-page__logo-img--full"
              />
            </Link>
            <h1 className="login-page__title">
              {mode === "login" ? "欢迎登录" : "创建账号"}
            </h1>
            <p className="login-page__subtitle">
              {mode === "login" ? "继续你的创作之旅" : "开启 JoyAI 创意世界"}
            </p>
          </div>

          <div className="login-page__tabs" role="tablist" aria-label="登录方式">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`login-page__tab${mode === "login" ? " login-page__tab--active" : ""}`}
              onClick={() => setMode("login")}
            >
              密码登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`login-page__tab${mode === "register" ? " login-page__tab--active" : ""}`}
              onClick={() => setMode("register")}
            >
              注册账号
            </button>
          </div>

          <form
            className="login-page__fields"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <label className="login-page__field">
              <User className="login-page__field-icon" aria-hidden />
              <input
                className="login-page__input"
                autoComplete="username"
                placeholder="用户名"
                maxLength={64}
                {...form.register("username")}
              />
            </label>

            <label className="login-page__field">
              <Lock className="login-page__field-icon" aria-hidden />
              <input
                className="login-page__input"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="密码"
                maxLength={64}
                {...form.register("password")}
              />
              <button
                type="button"
                className="login-page__eye"
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

            <button
              className="login-page__submit"
              type="submit"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting
                ? mode === "login"
                  ? "登录中..."
                  : "注册中..."
                : mode === "login"
                  ? "登录"
                  : "注册"}
            </button>
          </form>

          <p className="login-page__agreement">
            登录即表示同意
            <button
              type="button"
              className="login-page__link"
              onClick={() => setAgreement("user")}
            >
              《JoyAI 用户协议》
            </button>
            {" 与 "}
            <button
              type="button"
              className="login-page__link"
              onClick={() => setAgreement("privacy")}
            >
              《JoyAI 隐私政策》
            </button>
          </p>
        </div>

        <footer className="login-page__footer">
          <span className="login-page__back">灵感 · 创作 · 画布</span>
          <span className="login-page__icp">JoyAI · 万能 AIGC 创意工坊</span>
        </footer>
      </div>

      <Dialog
        open={agreement !== null}
        onOpenChange={(open) => !open && setAgreement(null)}
      >
        <DialogContent className="login-agreement-dialog border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>
              {agreement === "user" ? "JoyAI 用户协议" : "JoyAI 隐私政策"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-zinc-400">
            {agreement === "user"
              ? "使用本平台即表示你同意遵守内容创作规范，不得利用生成能力制作违法违规内容。正式协议文本将在上线前更新。"
              : "我们仅在提供服务所必需的范围内处理账号与创作数据，不会出售你的个人信息。正式隐私政策将在上线前更新。"}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
