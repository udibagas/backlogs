import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { createTransport } from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";
import type { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from "./auth.dto";

const safeUser = (user: { id: string; email: string; name: string; systemRole: string }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  systemRole: user.systemRole
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
      select: { id: true, email: true, name: true, systemRole: true }
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

  async forgotPassword(dto: ForgotPasswordDto) {
    const mail = this.smtpSettings();
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, email: true, name: true, active: true }
    });

    if (user?.active) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = this.hash(token);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({
          data: { userId: user.id, tokenHash, expiresAt }
        });
      });

      const resetUrl = new URL("/reset-password", this.config.getOrThrow<string>("WEB_ORIGIN"));
      resetUrl.searchParams.set("token", token);
      const safeName = this.escapeHtml(user.name);
      await createTransport(mail.transport).sendMail({
        from: mail.from,
        to: user.email,
        subject: "Reset your Sprintline password",
        text: `Hello ${user.name},\n\nUse this link to reset your Sprintline password. It expires in one hour:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>Hello ${safeName},</p><p>Use the link below to reset your Sprintline password. It expires in one hour.</p><p><a href="${resetUrl.toString()}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
      });
    }

    return { message: "If an active account exists for that email, a reset link will be sent." };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hash(dto.token);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: { select: { id: true, active: true } } }
      });
      if (
        !resetToken ||
        resetToken.usedAt ||
        resetToken.expiresAt <= now ||
        !resetToken.user.active
      ) {
        throw new BadRequestException("The password reset link is invalid or expired");
      }

      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      if (consumed.count !== 1) {
        throw new BadRequestException("The password reset link is invalid or expired");
      }

      const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
      await tx.user.update({
        where: { id: resetToken.user.id },
        data: { passwordHash }
      });
      await tx.refreshSession.updateMany({
        where: { userId: resetToken.user.id, revokedAt: null },
        data: { revokedAt: now }
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: resetToken.user.id, id: { not: resetToken.id } }
      });
    });

    return { message: "Password reset successfully. You can now sign in." };
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
      select: { id: true, email: true, name: true, systemRole: true, createdAt: true }
    });
    if (!user) throw new UnauthorizedException("Account is unavailable");
    return user;
  }

  private async createSession(user: {
    id: string;
    email: string;
    name: string;
    systemRole: string;
  }) {
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

  private smtpSettings() {
    const host = this.config.get<string>("SMTP_HOST");
    const from = this.config.get<string>("SMTP_FROM");
    if (!host || !from) {
      throw new ServiceUnavailableException("Password reset email is not configured");
    }

    const port = Number(this.config.get<string>("SMTP_PORT", "587"));
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new ServiceUnavailableException("SMTP_PORT must be a valid port number");
    }
    const secure = this.config.get<string>("SMTP_SECURE", "false");
    if (secure !== "true" && secure !== "false") {
      throw new ServiceUnavailableException("SMTP_SECURE must be true or false");
    }
    const username = this.config.get<string>("SMTP_USER");
    const password = this.config.get<string>("SMTP_PASSWORD");
    if (Boolean(username) !== Boolean(password)) {
      throw new ServiceUnavailableException("SMTP_USER and SMTP_PASSWORD must both be configured");
    }

    return {
      from,
      transport: {
        host,
        port,
        secure: secure === "true",
        ...(username && password ? { auth: { user: username, pass: password } } : {})
      }
    };
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return entities[character]!;
    });
  }
}
