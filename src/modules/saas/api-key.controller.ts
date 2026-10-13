import { Controller, Delete, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { AuthUser } from '@/shared/types/auth-user';

import { TenantService } from './tenant.service';

@ApiTags('SaaS 租户')
@ApiBearerAuth()
@Controller('saas/api-keys')
export class ApiKeyController {
  constructor(private readonly tenantService: TenantService) {}

  @Delete(':id')
  @RequirePermissions(PermissionCode.SaasApiKeyDelete)
  @ApiOperation({ summary: '删除 API Key（软删除，立即失效；租户管理员仅限自己的 Key）' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<null> {
    return this.tenantService.removeApiKey(id, user);
  }
}
