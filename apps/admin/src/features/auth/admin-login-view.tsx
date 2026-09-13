"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, User } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/shared/lib/api";
import { useAuthStore, type AuthUser } from "@/shared/lib/auth-store";
import "./admin-login.css";

const schema = z.object({
  username: z.string().min(1, "请输入账号"),
  password: z.string().min(4, "请输入密码"),
});

type FormValues = z.infer<typeof schema>;

export function AdminLoginView() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [hydrated, setHydrated] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && token && user?.role === "admin") {
      router.replace("/");
    }
  }, [hydrated, token, user, router]);

  async function onSubmit(values: FormValues) {
    try {
      const res = await api<{ accessToken: string; user: AuthUser }>(
        "/auth/login",
        { method: "POST", body: values, token: null },
      );
      if (res.user.role !== "admin") {
        toast.error("需要管理员账号");
        return;
      }
      setAuth(res.accessToken, res.user);
      toast.success("登录成功");
      router.replace("/");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "登录失败");
    }
  }

  return (
    <div className="login">
      <div className="loginCard">
        <div className="brand">
          <div className="mark">J</div>
          <div>
            <div className="title">JoyAI Admin</div>
            <div className="subtitle">AIGC 一体化创作平台管理后台</div>
          </div>
        </div>

        <form className="form" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="field">
            <label htmlFor="admin-username">账号</label>
            <div className="control">
              <User />
              <input
                id="admin-username"
                placeholder="请输入管理员账号"
                autoComplete="username"
                {...form.register("username")}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="admin-password">密码</label>
            <div className="control">
              <Lock />
              <input
                id="admin-password"
                type="password"
                placeholder="请输入密码"
                autoComplete="current-password"
                {...form.register("password")}
              />
            </div>
          </div>
          <button
            className="submit"
            type="submit"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <>
                <span className="spinner" />
                登录中…
              </>
            ) : (
              "登录"
            )}
          </button>
        </form>

        <div className="tip">默认管理员：admin / admin123</div>
      </div>
    </div>
  );
}
