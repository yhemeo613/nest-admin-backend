import { randomUUID } from 'node:crypto';

import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { requestContext } from './shared/context/request-context';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger, { strict: false }));

  const config = app.get(ConfigService);

  // ---- 安全与基础中间件 ----
  app.use(helmet());
  // 挂件需被任意第三方站点加载：仅 widget.js / chat-widget 放开跨源资源限制
  // （helmet 默认 CORP: same-origin 会拦截跨源 script 与 iframe 嵌入）
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/widget.js' || req.path === '/chat-widget') {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    if (req.path === '/chat-widget') {
      // 容器页以 iframe 嵌入第三方站点：放开 frame 限制（CSP frame-ancestors）
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    }
    next();
  });
  app.use(compression());
  const corsOrigin = config.get<string>('app.corsOrigin', '');
  app.enableCors({ origin: corsOrigin ? corsOrigin.split(',') : true, credentials: true });

  // ---- traceId 上下文（必须在 pino-http 之前挂载，保证日志能取到） ----
  app.use((req: Request & { id?: string }, res: Response, next: NextFunction) => {
    const traceId = (req.headers['x-request-id'] as string) || randomUUID();
    req.id = traceId;
    res.setHeader('x-request-id', traceId);
    requestContext.run({ traceId }, next);
  });

  // ---- 路由前缀：业务接口 /api/v1/*；健康检查与 C 端帮助中心（SEO 直出页）留在根路径 ----
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
      { path: 'robots.txt', method: RequestMethod.GET },
      { path: 'widget.js', method: RequestMethod.GET },
      { path: 'chat-widget', method: RequestMethod.GET },
      { path: 'help/*splat', method: RequestMethod.GET },
    ],
  });

  // ---- 全局校验管道：白名单 + 自动类型转换 + 拒绝多余字段 ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  // ---- Swagger（生产环境关闭） ----
  if (config.get<string>('app.env') !== 'production') {
    const docConfig = new DocumentBuilder()
      .setTitle('NestJS Admin API')
      .setDescription('企业级后端框架接口文档：细粒度权限中枢 + AI 基础设施')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, docConfig));
  }

  const port = config.get<number>('app.port', 3000);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`应用已启动: http://localhost:${port}`);
  if (config.get<string>('app.env') !== 'production') {
    logger.log(`Swagger 文档: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
