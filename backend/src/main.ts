import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    // Nest's own body parser is disabled so the Stripe webhook can keep its raw
    // bytes; the parsers are re-registered below with a rawBody capture.
    bodyParser: false,
  });

  const captureRawBody = (request: Request & { rawBody?: Buffer }, _res: Response, buffer: Buffer): void => {
    // Stripe signs the exact bytes it sent. Re-serialising the parsed JSON would
    // change whitespace and key order and every signature check would fail.
    if (request.originalUrl.startsWith('/api/webhooks/')) request.rawBody = Buffer.from(buffer);
  };
  app.use(express.json({ limit: '2mb', verify: captureRawBody }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // 422 (not the default 400) is the contract the SPA's form handlers expect for
      // a well-formed request whose values fail a business rule.
      errorHttpStatusCode: 422,
    }),
  );

  // The SPA is served by nginx in production and by `ng serve` in development, both
  // of which proxy /api to this process, so CORS only matters for the dev origin.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CNC Quick Quote API')
    .setDescription('Quoting, nesting, pricing, checkout and admin API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`CNC Quick Quote API listening on port ${port}`);
  logger.log(`Swagger docs at /api/docs`);
}

void bootstrap();
