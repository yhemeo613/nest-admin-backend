import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { requestContext } from '@/shared/context/request-context';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get<string>('app.env') !== 'production';
        return {
          pinoHttp: {
            level: config.get<string>('log.level', 'info'),
            // 复用上游传入的 x-request-id，否则生成 uuid；同时回写响应头
            genReqId: (req, res) => {
              const existing = (req as { id?: string | number }).id ?? req.headers['x-request-id'];
              const id =
                (Array.isArray(existing) ? existing[0] : existing)?.toString() ||
                crypto.randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            // 精简请求日志，只保留关键字段
            serializers: {
              req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
            // 敏感字段脱敏
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '***',
            },
            autoLogging: {
              ignore: (req: { url?: string }) =>
                ['/health', '/ready'].includes(req.url?.split('?')[0] ?? ''),
            },
            // 非 HTTP 链路的日志也通过 mixin 关联 traceId
            mixin: () => {
              const traceId = requestContext.traceId;
              return traceId ? { traceId } : {};
            },
            customProps: (req) => ({ traceId: (req as { id?: string | number }).id }),
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
