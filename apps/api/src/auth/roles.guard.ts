import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthUser } from "./auth.types";
import { USER_ROLES_KEY } from "./roles.decorator";
import type { UserRole } from "../generated/prisma/client";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(USER_ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!roles?.length) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!request.user?.sub) throw new UnauthorizedException("Authentication required");
    if (!request.user.systemRole || !roles.includes(request.user.systemRole)) {
      throw new ForbiddenException("You do not have permission to manage users");
    }
    return true;
  }
}
