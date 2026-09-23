import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole } from "../../database/enums";
import { UsersService } from "../users/users.service";
import { AuditService } from "../audit/audit.service";
import {
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "./totp";

type TokenUser = {
  id: string;
  username: string;
  role: UserRole;
  totpEnabled?: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.users.findByUsername(username);
    if (!user) {
      void this.audit.record(null, "auth.login_failed", { username });
      throw new UnauthorizedException("用户名或密码错误");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      void this.audit.record(user.id, "auth.login_failed", { username });
      throw new UnauthorizedException("用户名或密码错误");
    }

    if (user.totpEnabled && user.totpSecret) {
      const challengeToken = this.jwt.sign(
        { sub: user.id, username: user.username, purpose: "totp" },
        { expiresIn: "5m" },
      );
      return {
        requiresTotp: true as const,
        challengeToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      };
    }

    void this.audit.record(user.id, "auth.login", { username: user.username });
    return this.tokenFor(user);
  }

  async loginWithTotp(challengeToken: string, code: string) {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwt.verify(challengeToken) as {
        sub?: string;
        purpose?: string;
      };
    } catch {
      throw new UnauthorizedException("验证已过期，请重新登录");
    }
    if (payload.purpose !== "totp" || !payload.sub) {
      throw new UnauthorizedException("无效的验证凭证");
    }
    const user = await this.users.findById(payload.sub);
    if (!user?.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException("未启用身份验证器");
    }
    if (!verifyTotp(user.totpSecret, code)) {
      void this.audit.record(user.id, "auth.totp_failed", {
        username: user.username,
      });
      throw new UnauthorizedException("验证码错误");
    }
    void this.audit.record(user.id, "auth.login", {
      username: user.username,
      via: "totp",
    });
    return this.tokenFor(user);
  }

  async register(username: string, password: string) {
    const user = await this.users.create(username, password, UserRole.creator);
    return this.tokenFor(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException("新密码至少 6 位");
    }
    const user = await this.users.require(userId);
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException("当前密码不正确");
    await this.users.resetPassword(userId, newPassword);
    void this.audit.record(userId, "auth.password_changed", {
      username: user.username,
    });
    return { ok: true };
  }

  async totpSetup(userId: string) {
    const user = await this.users.require(userId);
    const secret = generateTotpSecret();
    await this.users.setTotpSecret(userId, secret);
    const url = otpauthUrl({
      secret,
      accountName: user.username,
      issuer: "JoyAI",
    });
    return {
      secret,
      otpauthUrl: url,
      qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`,
    };
  }

  async totpEnable(userId: string, code: string) {
    const user = await this.users.require(userId);
    if (!user.totpSecret) {
      throw new BadRequestException("请先扫码绑定验证器");
    }
    if (!verifyTotp(user.totpSecret, code)) {
      throw new BadRequestException("验证码错误");
    }
    await this.users.setTotpEnabled(userId, true);
    void this.audit.record(userId, "auth.totp_enabled", {
      username: user.username,
    });
    return { totpEnabled: true };
  }

  async totpDisable(userId: string, code: string) {
    const user = await this.users.require(userId);
    if (!user.totpEnabled || !user.totpSecret) {
      await this.users.disableTotp(userId);
      return { totpEnabled: false };
    }
    if (!verifyTotp(user.totpSecret, code)) {
      throw new BadRequestException("验证码错误");
    }
    await this.users.disableTotp(userId);
    void this.audit.record(userId, "auth.totp_disabled", {
      username: user.username,
    });
    return { totpEnabled: false };
  }

  private tokenFor(user: TokenUser) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    return {
      requiresTotp: false as const,
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        totpEnabled: Boolean(user.totpEnabled),
      },
    };
  }
}
