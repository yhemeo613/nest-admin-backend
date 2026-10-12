import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AiUsageService } from '@/infra/ai/ai-usage.service';
import { PermissionCode } from '@/shared/constants/permission-code';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';

@ApiTags('AI 用量')
@ApiBearerAuth()
@Controller('ai/usage')
export class AiUsageController {
  constructor(private readonly usageService: AiUsageService) {}

  @Get()
  @RequirePermissions(PermissionCode.AiUsageList)
  @ApiOperation({ summary: 'AI 用量汇总（按厂商/模型分组）' })
  summary() {
    return this.usageService.summary();
  }
}
