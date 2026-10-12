import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PermType, Status } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

export class CreatePermissionDto {
  @ApiPropertyOptional({ description: '父级权限点 ID（空为根节点）' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ description: '显示名称', example: '导出用户' })
  @IsString()
  @Length(1, 32)
  name: string;

  @ApiProperty({ description: '权限码（{模块}:{资源}:{动作}）', example: 'system:user:export' })
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9]+(:[a-z0-9-]+){0,2}$/, {
    message: '权限码格式应为 {模块}:{资源}:{动作} 小写三段式',
  })
  code: string;

  @ApiProperty({ description: '类型', enum: PermType })
  @IsEnum(PermType)
  type: PermType;

  @ApiPropertyOptional({ description: '前端路由路径（菜单时必填）' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: '图标' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;
}

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {
  @ApiPropertyOptional({ description: '状态', enum: Status })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}

export class PermissionNodeDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) parentId: string | null;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: PermType }) type: PermType;
  @ApiProperty({ nullable: true }) path: string | null;
  @ApiProperty({ nullable: true }) icon: string | null;
  @ApiProperty() sort: number;
  @ApiProperty({ enum: Status }) status: Status;
  @ApiProperty({ type: () => [PermissionNodeDto] }) children: PermissionNodeDto[];
}
