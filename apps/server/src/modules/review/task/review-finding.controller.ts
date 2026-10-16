import { Body, Controller, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionCode } from '@/shared/constants/permission-code';
import { RequirePermissions } from '@/shared/decorators/require-permissions.decorator';

import { UpdateFindingDto } from './dto/review-task.dto';
import { ReviewTaskService } from './review-task.service';

@ApiTags('代码评审-发现')
@ApiBearerAuth()
@Controller('review/findings')
export class ReviewFindingController {
  constructor(private readonly taskService: ReviewTaskService) {}

  @Put(':id')
  @RequirePermissions(PermissionCode.ReviewFindingUpdate)
  @ApiOperation({ summary: '发现状态流转（OPEN/FIXED/IGNORED/RESOLVED）' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFindingDto,
  ): Promise<null> {
    await this.taskService.updateFindingStatus(id, dto.status);
    return null;
  }
}
