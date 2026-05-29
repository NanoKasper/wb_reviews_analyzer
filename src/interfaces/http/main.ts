import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './filters/all-exception.filter.js';


async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
      transformOptions: {
  },
    whitelist: true,
  }));

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}

bootstrap().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
