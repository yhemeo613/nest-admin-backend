import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

/** 租户自助注册（Public + 限流）：一次提交完成「租户开通 + 管理员账号创建」 */
export class RegisterDto {
  @ApiProperty({ description: '企业/租户名称', example: '星辰电商' })
  @IsString()
  @Length(1, 64)
  tenantName: string;

  @ApiProperty({
    description: '租户编码（全局唯一，将作为帮助中心域名段 /help/{code}）',
    example: 'xingchen',
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, {
    message: '租户编码仅支持小写字母、数字、中划线，长度 3-32',
  })
  tenantCode: string;

  @ApiProperty({ description: '管理员登录账号', example: 'boss' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{2,32}$/, { message: '账号需为 2-32 位字母、数字或下划线' })
  username: string;

  @ApiProperty({ description: '管理员密码（6-64 位）', example: 'Pass@12345' })
  @IsString()
  @Length(6, 64)
  password: string;

  @ApiPropertyOptional({ description: '管理员昵称（缺省同账号）', example: '张三' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  nickname?: string;

  @ApiPropertyOptional({ description: '联系邮箱', example: 'boss@xingchen.example.com' })
  @IsOptional()
  @IsString()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: '邮箱格式不正确' })
  email?: string;
}
