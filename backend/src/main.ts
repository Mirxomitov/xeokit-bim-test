import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigError, loadConfig, loadLocalEnvFile } from './config/env';

async function bootstrap(): Promise<void> {
  loadLocalEnvFile();
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.forRoot(config));
  app.setGlobalPrefix('api');
  // The viewer page is served by the app itself (http://127.0.0.1:<random port>), so allow any origin.
  // Fine for local testing; CIP restricts origins.
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const docs = new DocumentBuilder().setTitle('BIM backend').setVersion('0.1.0').build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, docs));
  await app.listen(config.port, config.host);
  console.log(`BIM backend on http://localhost:${config.port}/api/bim/models (docs: /api/docs)`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
