import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { CoreController } from "./core/core.controller";
import { CoreService } from "./core/core.service";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";

function validateEnvironment(config: Record<string, unknown>) {
  const secret = config.JWT_ACCESS_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET must contain at least 32 characters");
  }
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const accessTtl = config.ACCESS_TOKEN_TTL ?? "15m";
  if (typeof accessTtl !== "string" || !/^[1-9]\d{0,3}[smhd]$/.test(accessTtl)) {
    throw new Error("ACCESS_TOKEN_TTL must be a duration such as 15m or 1h");
  }
  const refreshDays = Number(config.REFRESH_TOKEN_DAYS ?? "30");
  if (!Number.isInteger(refreshDays) || refreshDays < 1 || refreshDays > 90) {
    throw new Error("REFRESH_TOKEN_DAYS must be an integer between 1 and 90");
  }
  const webOrigin = config.WEB_ORIGIN ?? "http://localhost:3000";
  if (typeof webOrigin !== "string" || new URL(webOrigin).origin !== webOrigin) {
    throw new Error("WEB_ORIGIN must be a valid origin without a path");
  }
  if (config.COOKIE_SECURE !== undefined && !["true", "false"].includes(String(config.COOKIE_SECURE))) {
    throw new Error("COOKIE_SECURE must be true or false");
  }
  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])
  ],
  controllers: [AuthController, CoreController, HealthController],
  providers: [
    PrismaService,
    AuthService,
    CoreService,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard }
  ]
})
export class AppModule {}
