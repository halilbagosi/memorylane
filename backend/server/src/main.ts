import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.enableCors();
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}
bootstrap();