import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { AuthUser } from "./auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Authentication required");

    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET
      });
      if (!payload.sub || !payload.email) throw new Error("Invalid token payload");
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Session expired or invalid");
    }
  }
}
