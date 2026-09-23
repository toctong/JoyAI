"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api, ApiError } from "@/shared/lib/api";
import { useAuthHydrated, useAuthStore } from "@/shared/lib/auth-store";
import { TotpSecurityDialog } from "@/features/auth/totp-security-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function AccountPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [totpOpen, setTotpOpen] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(Boolean(user?.totpEnabled));

  const refreshMe = useCallback(async () => {
    if (!token) return;
    const me = await api<{
      id: string;
      username: string;
      role: "admin" | "creator";
      totpEnabled: boolean;
      createdAt?: string;
    }>("/auth/me");
    setTotpEnabled(Boolean(me.totpEnabled));
    setAuth(token, {
      id: me.id,
      username: me.username,
      role: me.role,
      totpEnabled: me.totpEnabled,
    });
  }, [setAuth, token]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    void refreshMe().catch(() => undefined);
  }, [hydrated, token, router, refreshMe]);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success("密码已更新");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "修改失败");
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated || !token) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">账户设置</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          管理登录密码与身份验证器。
        </p>
      </div>

      <section className="space-y-3 rounded-[4px] border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-medium">账号信息</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              当前登录身份
            </div>
          </div>
          <Badge variant="secondary" className="rounded-[2px] font-normal">
            {user?.role === "admin" ? "管理员" : "创作者"}
          </Badge>
        </div>
        <div className="grid gap-1 text-[13px]">
          <span className="text-muted-foreground">用户名</span>
          <span className="font-medium">{user?.username}</span>
        </div>
      </section>

      <section className="space-y-3 rounded-[4px] border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <div>
            <div className="text-[14px] font-medium">修改密码</div>
            <div className="text-[12px] text-muted-foreground">
              需验证当前密码后设置新密码
            </div>
          </div>
        </div>
        <form className="space-y-3" onSubmit={onChangePassword}>
          <div className="space-y-1.5">
            <Label htmlFor="current-password">当前密码</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              className="h-8 rounded-[2px]"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">新密码</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="h-8 rounded-[2px]"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">确认新密码</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="h-8 rounded-[2px]"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              className="h-8 rounded-[2px]"
              disabled={saving}
            >
              {saving ? "保存中…" : "更新密码"}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded-[4px] border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <div>
              <div className="text-[14px] font-medium">身份验证器</div>
              <div className="text-[12px] text-muted-foreground">
                腾讯身份验证器 / 兼容 TOTP
              </div>
            </div>
          </div>
          <Badge
            variant={totpEnabled ? "default" : "secondary"}
            className="rounded-[2px] font-normal"
          >
            {totpEnabled ? "已开启" : "未开启"}
          </Badge>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-[2px]"
            onClick={() => setTotpOpen(true)}
          >
            {totpEnabled ? "管理验证器" : "绑定验证器"}
          </Button>
        </div>
      </section>

      <TotpSecurityDialog
        open={totpOpen}
        onOpenChange={(open) => {
          setTotpOpen(open);
          if (!open) void refreshMe().catch(() => undefined);
        }}
      />
    </div>
  );
}
