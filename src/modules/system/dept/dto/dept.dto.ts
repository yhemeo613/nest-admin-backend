import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Status } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreateDeptDto {
  @ApiPropertyOptional({ description: '父级部门 ID（空为根节点）' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ description: '部门名称', example: '技术部' })
  @IsString()
  @Length(1, 32)
  name: string;

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;
}

export class UpdateDeptDto extends PartialType(CreateDeptDto) {
  @ApiPropertyOptional({ description: '状态', enum: Status })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}

export class DeptNodeDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) parentId: string | null;
  @ApiProperty() name: string;
  @ApiProperty() sort: number;
  @ApiProperty({ enum: Status }) status: Status;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ type: () => [DeptNodeDto] }) children: DeptNodeDto[];
}
