import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Request, Response, NextFunction } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE"] });
  app.use(helmet());
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const unsafeMethod = ["POST", "PATCH", "DELETE", "PUT"].includes(request.method);
    const requestOrigin = request.headers.origin;
    if (unsafeMethod && requestOrigin && requestOrigin !== origin) {
      response.status(403).json({ statusCode: 403, message: "Request origin is not allowed" });
      return;
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  );
  const swagger = new DocumentBuilder()
    .setTitle("Agile Project Management API")
    .setDescription("Versioned API for organizations, projects, backlog, Sprints, and tasks.")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));
  await app.listen(Number(process.env.API_PORT ?? 4000), "0.0.0.0");
}

void bootstrap();
