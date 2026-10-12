import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ description: '用户名', example: 'zhangsan' })
  @IsString()
  @Length(2, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '用户名仅支持字母、数字、下划线' })
  username: string;

  @ApiProperty({ description: '初始密码（至少 6 位）', example: 'Init@123456' })
  @IsString()
  @Length(6, 64)
  password: string;

  @ApiProperty({ description: '昵称', example: '张三' })
  @IsString()
  @Length(1, 32)
  nickname: string;

  @ApiPropertyOptional({ description: '邮箱' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @IsString()
  @Length(5, 20)
  phone?: string;

  @ApiPropertyOptional({ description: '部门 ID' })
  @IsOptional()
  @IsUUID()
  deptId?: string;

  @ApiPropertyOptional({ description: '角色 ID 集合', type: [String] })
  @IsOptional()
  @IsUUID(undefined, { each: true })
  roleIds?: string[];
}
