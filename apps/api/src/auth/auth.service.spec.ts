import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

const rawToken = "A".repeat(43);
const tokenHash = createHash("sha256").update(rawToken).digest("hex");

function createService(resetToken: {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  user: { id: string; active: boolean };
}) {
  let storedPasswordHash = "";
  let revokedSessions = false;
  let tokenUsedAt: Date | null = resetToken.usedAt;
  const transactionClient = {
    passwordResetToken: {
      findUnique: async (args: { where: { tokenHash: string } }) =>
        args.where.tokenHash === resetToken.tokenHash ? resetToken : null,
      updateMany: async (_args: {
        where: { id: string; usedAt: null; expiresAt: { gt: Date } };
        data: { usedAt: Date };
      }) => {
        if (tokenUsedAt || resetToken.expiresAt <= new Date()) return { count: 0 };
        tokenUsedAt = _args.data.usedAt;
        return { count: 1 };
      },
      deleteMany: async (args: { where: { userId: string; id: { not: string } } }) => {
        assert.equal(args.where.userId, resetToken.userId);
        assert.equal(args.where.id.not, resetToken.id);
        return { count: 0 };
      }
    },
    user: {
      update: async (args: { where: { id: string }; data: { passwordHash: string } }) => {
        assert.equal(args.where.id, resetToken.user.id);
        storedPasswordHash = args.data.passwordHash;
      }
    },
    refreshSession: {
      updateMany: async (args: {
        where: { userId: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => {
        assert.equal(args.where.userId, resetToken.user.id);
        revokedSessions = true;
        return { count: 1 };
      }
    }
  };
  const prisma = {
    $transaction: async <T>(callback: (tx: typeof transactionClient) => Promise<T>) =>
      callback(transactionClient)
  } as unknown as PrismaService;

  return {
    auth: new AuthService(prisma, {} as JwtService, {} as ConfigService),
    get storedPasswordHash() {
      return storedPasswordHash;
    },
    get revokedSessions() {
      return revokedSessions;
    },
    get tokenUsedAt() {
      return tokenUsedAt;
    }
  };
}

test("password reset consumes the token, hashes the new password, and revokes refresh sessions", async () => {
  const mock = createService({
    id: "reset-id",
    tokenHash,
    userId: "user-id",
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    user: { id: "user-id", active: true }
  });

  const result = await mock.auth.resetPassword({
    token: rawToken,
    password: "new-secure-password"
  });

  assert.equal(result.message, "Password reset successfully. You can now sign in.");
  assert.equal(await argon2.verify(mock.storedPasswordHash, "new-secure-password"), true);
  assert.ok(mock.tokenUsedAt);
  assert.equal(mock.revokedSessions, true);
  await assert.rejects(
    mock.auth.resetPassword({ token: rawToken, password: "another-secure-password" }),
    BadRequestException
  );
});

test("password reset rejects expired, used, or inactive-account tokens", async () => {
  const invalidTokens = [
    {
      id: "expired",
      expiresAt: new Date(Date.now() - 60_000),
      usedAt: null,
      user: { id: "user-id", active: true }
    },
    {
      id: "used",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      user: { id: "user-id", active: true }
    },
    {
      id: "inactive",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      user: { id: "user-id", active: false }
    }
  ];

  for (const resetToken of invalidTokens) {
    const mock = createService({ ...resetToken, tokenHash, userId: "user-id" });
    await assert.rejects(
      mock.auth.resetPassword({ token: rawToken, password: "new-secure-password" }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.getStatus() === 400 &&
        error.message === "The password reset link is invalid or expired"
    );
    assert.equal(mock.storedPasswordHash, "");
    assert.equal(mock.revokedSessions, false);
  }
});
