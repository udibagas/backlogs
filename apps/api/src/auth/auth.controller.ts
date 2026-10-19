import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import type { AuthUser } from "./auth.types";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { LoginDto, RegisterDto } from "./auth.dto";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(dto);
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post("login")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post("refresh")
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(request.cookies?.refresh_session as string | undefined);
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.refresh_session as string | undefined);
    response.clearCookie("refresh_session", this.cookieOptions());
  }

  @Get("me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }

  private setRefreshCookie(response: Response, token: string, expiresAt: Date) {
    response.cookie("refresh_session", token, {
      ...this.cookieOptions(),
      expires: expiresAt
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.configBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
      sameSite: "strict" as const,
      path: "/api/v1/auth"
    };
  }

  private configBoolean(value: string | undefined, fallback: boolean) {
    if (value === undefined) return fallback;
    return value === "true";
  }
}
