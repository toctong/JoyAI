import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole } from "../../database/enums";
import { UsersService } from "../users/users.service";
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
  ) {}

  async login(username: string, password: string) {
    const user = await this.users.findByUsername(username);
    if (!user) throw new UnauthorizedException("用户名或密码错误");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("用户名或密码错误");

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
      throw new UnauthorizedException("验证码错误");
    }
    return this.tokenFor(user);
  }

  async register(username: string, password: string) {
    const user = await this.users.create(username, password, UserRole.creator);
    return this.tokenFor(user);
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
