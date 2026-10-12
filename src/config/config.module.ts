import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './configuration';
import { envValidationSchema } from './env.validation';

const nodeEnv = process.env.NODE_ENV ?? 'development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      // 优先级：.env 兜底，.env.{NODE_ENV} 覆盖
      envFilePath: [`.env.${nodeEnv}`, '.env'],
    }),
  ],
})
export class AppConfigModule {}
