import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Rate limits key on the client IP, so trust X-Forwarded-For only from known proxies
  // (the portal's /api proxy locally; your load balancer in production).
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY ?? 'loopback'));
  // The portal reaches this API through its own /api proxy, so no CORS is needed.
  app.use(cookieParser());
  // Room for a bot profile photo (a base64 JPEG) on top of the usual small bodies.
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  const docs = new DocumentBuilder()
    .setTitle('Telenotify API')
    .setDescription('Message your customers on Telegram. Use a `tn_test_` key for the sandbox and a `tn_live_` key for production.')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, docs));

  await app.listen(Number(process.env.PORT ?? 3000));
}
function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

bootstrap();
