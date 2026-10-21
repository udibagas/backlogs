import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../generated/prisma/client";
import { RolesGuard } from "./roles.guard";

function createContext(systemRole?: UserRole) {
  return {
    getHandler: () => createContext,
    getClass: () => createContext,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: "user-id", email: "user@example.com", systemRole } })
    })
  } as unknown as ExecutionContext;
}

test("user-management role guard permits system administrators", async () => {
  const reflector = {
    getAllAndOverride: () => [UserRole.ADMIN]
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  assert.equal(await guard.canActivate(createContext(UserRole.ADMIN)), true);
});

test("user-management role guard denies regular users", async () => {
  const reflector = {
    getAllAndOverride: () => [UserRole.ADMIN]
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  await assert.rejects(
    guard.canActivate(createContext(UserRole.USER)),
    ForbiddenException
  );
});
