import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "./auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Authentication required");

    let payload: AuthUser;
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET
      });
    } catch {
      throw new UnauthorizedException("Session expired or invalid");
    }
    if (!payload.sub || !payload.email) throw new UnauthorizedException("Session expired or invalid");
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { active: true, systemRole: true }
    });
    if (!user?.active) throw new UnauthorizedException("Account is unavailable");
    request.user = { ...payload, systemRole: user.systemRole };
    return true;
  }
}
