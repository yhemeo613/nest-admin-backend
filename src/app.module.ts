import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from '@/config/config.module';
import { AiModule } from '@/infra/ai/ai.module';
import { LoggerModule } from '@/infra/logger/logger.module';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { RedisModule } from '@/infra/redis/redis.module';
import { AiChatModule } from '@/modules/ai-chat/ai-chat.module';
import { AiConfigModule } from '@/modules/ai-config/ai-config.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { HealthModule } from '@/modules/health/health.module';
import { NotificationModule } from '@/modules/notification/notification.module';
import { SystemModule } from '@/modules/system/system.module';
import { AllExceptionsFilter } from '@/shared/filters/all-exceptions.filter';
import { JwtAuthGuard } from '@/shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/shared/guards/permissions.guard';
import { DataScopeInterceptor } from '@/shared/interceptors/data-scope.interceptor';
import { TransformInterceptor } from '@/shared/interceptors/transform.interceptor';
import { SharedModule } from '@/shared/shared.module';

/**
 * 根模块：只装配，不写逻辑。
 * 全局守卫注册顺序即执行顺序：ThrottlerGuard → JwtAuthGuard → PermissionsGuard。
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    RedisModule,
    SharedModule,
    EventEmitterModule.forRoot(),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: { expiresIn: config.get<number>('jwt.accessTtlSeconds', 7200) },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttlMs', 60_000),
            limit: config.get<number>('throttle.limit', 100),
          },
        ],
      }),
    }),
    AiModule,
    AuthModule,
    SystemModule,
    AiChatModule,
    AiConfigModule,
    DashboardModule,
    NotificationModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: DataScopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
