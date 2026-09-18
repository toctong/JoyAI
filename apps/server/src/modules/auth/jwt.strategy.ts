import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthUser } from "../../common/current-user.decorator";
import { UsersService } from "../users/users.service";

type JwtPayload = {
  sub: string;
  username: string;
  role: "admin" | "creator";
};

/**
 * Identity follows unique username, not the JWT `sub`.
 * If admin is recreated with a new id, old tokens still resolve to the
 * current row for that username after orphan ownership is healed.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "dev-secret",
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const username = payload.username?.trim();
    if (!username) {
      throw new UnauthorizedException("无效的登录凭证");
    }
    const user = await this.users.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException("用户不存在或已失效，请重新登录");
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }
}
