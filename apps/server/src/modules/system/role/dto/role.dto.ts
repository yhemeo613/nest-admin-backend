import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DataScope, Status } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

import { PaginationDto } from '@/shared/dto/pagination.dto';

export class CreateRoleDto {
  @ApiProperty({ description: '角色编码', example: 'auditor' })
  @IsString()
  @Length(2, 32)
  @Matches(/^[a-z0-9-]+$/, { message: '角色编码仅支持小写字母、数字、中划线' })
  code: string;

  @ApiProperty({ description: '角色名称', example: '审计员' })
  @IsString()
  @Length(1, 32)
  name: string;

  @ApiPropertyOptional({ description: '数据权限范围', enum: DataScope, default: DataScope.SELF })
  @IsOptional()
  @IsEnum(DataScope)
  dataScope?: DataScope;

  @ApiPropertyOptional({ description: '自定义部门集合（dataScope=CUSTOM 时必填）', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  deptIds?: string[];

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class QueryRoleDto extends PaginationDto {
  @ApiPropertyOptional({ description: '角色编码/名称模糊搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '状态', enum: Status })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}

export class AssignPermissionsDto {
  @ApiProperty({ description: '权限点 ID 集合', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  permissionIds: string[];
}

export class SetDataScopeDto {
  @ApiProperty({ description: '数据权限范围', enum: DataScope })
  @IsEnum(DataScope)
  dataScope: DataScope;

  @ApiPropertyOptional({ description: '自定义部门集合（CUSTOM 时必填）', type: [String] })
  @ValidateIf((o: SetDataScopeDto) => o.dataScope === DataScope.CUSTOM)
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  deptIds?: string[];
}

export class RoleResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: DataScope }) dataScope: DataScope;
  @ApiProperty({ enum: Status }) status: Status;
  @ApiProperty() sort: number;
  @ApiProperty({ nullable: true }) remark: string | null;
  @ApiProperty({ description: '权限点 ID 集合', type: [String] }) permissionIds: string[];
  @ApiProperty({ description: '自定义部门 ID 集合', type: [String] }) deptIds: string[];
  @ApiProperty() createdAt: Date;
}
