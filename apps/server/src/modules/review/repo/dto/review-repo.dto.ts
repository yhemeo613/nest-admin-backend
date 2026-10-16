import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewPlatform } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

import { PaginationDto } from '@/shared/dto/pagination.dto';

const GIT_URL_PATTERN = /^(https?:\/\/\S+|git@\S+:\S+|ssh:\/\/\S+|file:\/\/\/\S+)$/;
const GIT_URL_MSG = 'gitUrl 格式不正确（支持 https/ssh/git@/file://）';

export class CreateRepoDto {
  @ApiProperty({ description: '显示名', example: 'nest 后端' })
  @IsString()
  @Length(1, 64)
  name: string;

  @ApiProperty({ enum: ReviewPlatform, description: '托管平台（决定 MR 回写客户端）' })
  @IsEnum(ReviewPlatform)
  platform: ReviewPlatform;

  @ApiProperty({ description: 'clone 地址', example: 'https://gitlab.com/group/repo.git' })
  @IsString()
  @Matches(GIT_URL_PATTERN, { message: GIT_URL_MSG })
  gitUrl: string;

  @ApiPropertyOptional({ description: '默认分支', default: 'main' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  defaultBranch?: string;

  @ApiPropertyOptional({ description: '访问凭证 user:token（HTTPS 仓库，加密存储；留空不修改）' })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  credential?: string;
}

export class UpdateRepoDto {
  @ApiPropertyOptional({ description: '显示名' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @ApiPropertyOptional({ enum: ReviewPlatform })
  @IsOptional()
  @IsEnum(ReviewPlatform)
  platform?: ReviewPlatform;

  @ApiPropertyOptional({ description: 'clone 地址' })
  @IsOptional()
  @IsString()
  @Matches(GIT_URL_PATTERN, { message: GIT_URL_MSG })
  gitUrl?: string;

  @ApiPropertyOptional({ description: '默认分支' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  defaultBranch?: string;

  @ApiPropertyOptional({ description: '访问凭证（加密存储；留空不修改；传 "-" 清除）' })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  credential?: string;
}

export class QueryRepoDto extends PaginationDto {
  @ApiPropertyOptional({ description: '名称模糊搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: ReviewPlatform })
  @IsOptional()
  @IsEnum(ReviewPlatform)
  platform?: ReviewPlatform;
}

export class RepoResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ReviewPlatform }) platform: string;
  @ApiProperty() gitUrl: string;
  @ApiProperty() defaultBranch: string;
  @ApiProperty({ description: '是否已配置访问凭证' }) hasCredential: boolean;
  @ApiProperty({ description: '工作区状态 NONE|READY|ERROR' }) workspaceStatus: string;
  @ApiProperty({ nullable: true }) lastSyncAt: Date | null;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
