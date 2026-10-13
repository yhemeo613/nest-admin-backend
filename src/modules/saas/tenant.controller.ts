import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';
import { PageResult } from '@/shared/dto/pagination.dto';
import { AuthUser } from '@/shared/types/auth-user';

import {
  ApiKeyView,
  CreateApiKeyDto,
  CreateTenantDto,
  QueryTenantDto,
  TenantView,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { TenantService } from './tenant.service';

@ApiTags('SaaS 租户')
@ApiBearerAuth()
@Controller('saas/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @RequirePermissions(PermissionCode.SaasTenantList)
  @ApiOperation({ summary: '租户分页列表（租户管理员只看得到自己的租户）' })
  page(
    @Query() query: QueryTenantDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PageResult<TenantView>> {
    return this.tenantService.page(query, user);
  }

  @Post()
  @RequirePermissions(PermissionCode.SaasTenantCreate)
  @ApiOperation({ summary: '新增租户' })
  create(@Body() dto: CreateTenantDto, @CurrentUser() user: AuthUser): Promise<TenantView> {
    return this.tenantService.create(dto, user.userId);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.SaasTenantUpdate)
  @ApiOperation({ summary: '修改租户' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto): Promise<TenantView> {
    return this.tenantService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.SaasTenantDelete)
  @ApiOperation({ summary: '删除租户（软删除，API Key 连带失效）' })
  remove(@Param('id') id: string): Promise<null> {
    return this.tenantService.remove(id);
  }

  @Get(':id/api-keys')
  @RequirePermissions(PermissionCode.SaasApiKeyList)
  @ApiOperation({ summary: '租户的 API Key 列表（不含明文；租户管理员仅限自己的租户）' })
  listApiKeys(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ApiKeyView[]> {
    return this.tenantService.listApiKeys(id, user);
  }

  @Post(':id/api-keys')
  @RequirePermissions(PermissionCode.SaasApiKeyCreate)
  @ApiOperation({ summary: '创建 API Key（明文仅本次返回）' })
  createApiKey(
    @Param('id') id: string,
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ApiKeyView> {
    return this.tenantService.createApiKey(id, dto, user.userId, user);
  }
}
