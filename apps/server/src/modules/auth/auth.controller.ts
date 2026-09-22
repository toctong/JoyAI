import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../../common/guards";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { UsersService } from "../users/users.service";

class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(4)
  password!: string;
}

class RegisterDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

class TotpLoginDto {
  @IsString()
  challengeToken!: string;

  @IsString()
  @MinLength(6)
  code!: string;
}

class TotpCodeDto {
  @IsString()
  @MinLength(6)
  code!: string;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Post("login/totp")
  loginTotp(@Body() dto: TotpLoginDto) {
    return this.auth.loginWithTotp(dto.challengeToken, dto.code);
  }

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.username, dto.password);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: AuthUser) {
    const full = await this.users.findById(user.id);
    return {
      id: full!.id,
      username: full!.username,
      role: full!.role,
      totpEnabled: Boolean(full!.totpEnabled),
      createdAt: full!.createdAt,
    };
  }

  /** Start TOTP bind — returns secret + otpauth / QR (腾讯身份验证器兼容). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("totp/setup")
  totpSetup(@CurrentUser() user: AuthUser) {
    return this.auth.totpSetup(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("totp/enable")
  totpEnable(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto) {
    return this.auth.totpEnable(user.id, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("totp/disable")
  totpDisable(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto) {
    return this.auth.totpDisable(user.id, dto.code);
  }
}
