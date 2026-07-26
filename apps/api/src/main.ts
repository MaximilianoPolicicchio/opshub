import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { HttpExceptionFilter, PrismaExceptionFilter } from "./common/filters";
import { TransformInterceptor, LoggingInterceptor } from "./common/interceptors";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: configService.get<string>("WEB_ORIGIN"),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  const port = configService.get<number>("API_PORT") ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`OpsHub API listening on port ${port}`);
}

bootstrap();
