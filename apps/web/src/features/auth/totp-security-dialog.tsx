"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ShieldCheck } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api, ApiError } from "@/shared/lib/api";
import { useAuthStore } from "@/shared/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SetupInfo = {
  secret: string;
  otpauthUrl: string;
  qrImageUrl: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TotpSecurityDialog({ open, onOpenChange }: Props) {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const [enabled, setEnabled] = useState(Boolean(user?.totpEnabled));
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    const me = await api<{
      id: string;
      username: string;
      role: "admin" | "creator";
      totpEnabled: boolean;
    }>("/auth/me");
    setEnabled(Boolean(me.totpEnabled));
    setAuth(token, {
      id: me.id,
      username: me.username,
      role: me.role,
      totpEnabled: me.totpEnabled,
    });
  }, [setAuth, token]);

  useEffect(() => {
    if (!open) {
      setSetup(null);
      setCode("");
      return;
    }
    void refreshMe().catch(() => undefined);
  }, [open, refreshMe]);

  async function startSetup() {
    setBusy(true);
    try {
      const info = await api<SetupInfo>("/auth/totp/setup", { method: "POST" });
      setSetup(info);
      setCode("");
      toast.success("请用腾讯身份验证器扫码");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "发起绑定失败");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    if (code.trim().length < 6) {
      toast.error("请输入 6 位验证码");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/totp/enable", {
        method: "POST",
        body: { code: code.trim() },
      });
      toast.success("身份验证器已开启");
      setSetup(null);
      setCode("");
      await refreshMe();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "开启失败");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (code.trim().length < 6) {
      toast.error("请输入当前 6 位验证码以关闭");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/totp/disable", {
        method: "POST",
        body: { code: code.trim() },
      });
      toast.success("已关闭身份验证器");
      setSetup(null);
      setCode("");
      await refreshMe();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "关闭失败");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!setup?.secret) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      toast.success("密钥已复制");
    } catch {
      toast.error("复制失败");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            腾讯身份验证器
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="leading-relaxed text-muted-foreground">
            兼容腾讯身份验证器 / Google Authenticator（TOTP）。开启后，登录需额外输入
            6 位动态码。管理员建议开启。
          </p>

          <p>
            当前状态：{" "}
            <strong>{enabled ? "已开启" : "未开启"}</strong>
          </p>

          {setup ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrImageUrl}
                alt="TOTP QR"
                className="mx-auto size-[180px] rounded-md bg-white p-2"
              />
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all text-xs">{setup.secret}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 shrink-0"
                  onClick={() => void copySecret()}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                无法扫码时可在验证器中手动输入上方密钥。
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>6 位验证码</Label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {!enabled && !setup ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void startSetup()}
            >
              开始绑定
            </Button>
          ) : null}
          {setup ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void confirmEnable()}
            >
              确认开启
            </Button>
          ) : null}
          {enabled && !setup ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void startSetup()}
              >
                重新绑定
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void disable()}
              >
                关闭验证器
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
