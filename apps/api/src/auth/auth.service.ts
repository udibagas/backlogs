import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { LoginDto, RegisterDto } from "./auth.dto";

const safeUser = (user: { id: string; email: string; name: string }) => ({
  id: user.id,
  email: user.email,
  name: user.name
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) throw new ConflictException("An account with this email already exists");
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: { email, name: dto.name.trim(), passwordHash },
      select: { id: true, email: true, name: true }
    });
    return { user, ...(await this.createSession(user)) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() }
    });
    if (!user?.active || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("Email or password is incorrect");
    }
    return { user: safeUser(user), ...(await this.createSession(user)) };
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw new UnauthorizedException("Refresh session is missing");
    const tokenHash = this.hash(rawToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) {
      throw new UnauthorizedException("Refresh session is invalid or expired");
    }
    const nextToken = randomBytes(48).toString("base64url");
    const expiresAt = this.refreshExpiry();
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() }
      });
      if (revoked.count !== 1) throw new UnauthorizedException("Refresh session was already used");
      await tx.refreshSession.create({
        data: { userId: session.userId, tokenHash: this.hash(nextToken), expiresAt }
      });
    });
    return {
      refreshToken: nextToken,
      refreshExpiresAt: expiresAt,
      accessToken: await this.accessToken(session.user),
      user: safeUser(session.user)
    };
  }

  async logout(rawToken: string | undefined) {
    if (rawToken) {
      await this.prisma.refreshSession.updateMany({
        where: { tokenHash: this.hash(rawToken), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true }
    });
    if (!user) throw new UnauthorizedException("Account is unavailable");
    return user;
  }

  private async createSession(user: { id: string; email: string; name: string }) {
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshExpiresAt = this.refreshExpiry();
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: refreshExpiresAt
      }
    });
    return {
      accessToken: await this.accessToken(user),
      refreshToken,
      refreshExpiresAt
    };
  }

  private async accessToken(user: { id: string; email: string }) {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>(
          "ACCESS_TOKEN_TTL",
          "15m"
        ) as `${number}${"s" | "m" | "h" | "d"}`
      }
    );
  }

  private refreshExpiry() {
    const days = Number(this.config.get<string>("REFRESH_TOKEN_DAYS", "30"));
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new Error("REFRESH_TOKEN_DAYS must be an integer between 1 and 90");
    }
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
