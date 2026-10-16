import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { DataScope } from '@/shared/decorators/data-scope.decorator';
import { DataScopeFilter } from '@/shared/decorators/data-scope-filter.decorator';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';

import { DashboardStats, ReviewDashboardService } from './review-dashboard.service';

@ApiTags('代码评审-工作台')
@ApiBearerAuth()
@Controller('review/dashboard')
export class ReviewDashboardController {
  constructor(private readonly dashboardService: ReviewDashboardService) {}

  @Get('stats')
  @RequirePermissions(PermissionCode.ReviewDashboardQuery)
  @DataScope({ ownerField: 'createdBy' })
  @ApiOperation({ summary: '工作台统计（30 天窗口，带数据权限）' })
  stats(@DataScopeFilter() scopeFilter: Record<string, unknown>): Promise<DashboardStats> {
    return this.dashboardService.stats(scopeFilter);
  }
}
