import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class TokenPairDto {
  @ApiProperty({ description: '访问令牌（2 小时有效）' })
  accessToken: string;

  @ApiProperty({ description: '刷新令牌（7 天有效，登出/重置密码即失效）' })
  refreshToken: string;

  @ApiProperty({ description: '访问令牌有效期（秒）' })
  expiresIn: number;
}

export class ProfileMenuDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: ['DIR', 'MENU'] }) type: string;
  @ApiProperty({ nullable: true }) path: string | null;
  @ApiProperty({ nullable: true }) icon: string | null;
  @ApiProperty() sort: number;
  @ApiProperty({ description: '隐藏菜单：路由注册但不进侧栏（详情页）' })
  isHidden: boolean;
  @ApiProperty({ type: () => [ProfileMenuDto] }) children: ProfileMenuDto[];
}

/** 修改自己的资料（登录即可，字段缺省则不改） */
export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '昵称', example: '张三' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  nickname?: string;

  @ApiPropertyOptional({ description: '邮箱', example: 'me@example.com' })
  @IsOptional()
  @IsString()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: '邮箱格式不正确' })
  email?: string;

  @ApiPropertyOptional({ description: '手机号', example: '13800138000' })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;
}

/** 修改自己的密码（登录即可；成功后强制重新登录） */
export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  @IsString()
  @Length(1, 64)
  oldPassword: string;

  @ApiProperty({ description: '新密码（6-64 位）', example: 'NewPass@123' })
  @IsString()
  @Length(6, 64)
  newPassword: string;
}

export class ProfileDto {
  @ApiProperty({ description: '用户基本信息' })
  user: {
    id: string;
    username: string;
    nickname: string;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    deptId: string | null;
    isSuper: boolean;
  };

  @ApiProperty({ description: '角色编码集合', example: ['admin'] })
  roles: string[];

  @ApiProperty({
    description: '权限码集合（前端按钮显隐依据）',
    example: ['system:user:list', 'ai:chat:ask'],
  })
  permissions: string[];

  @ApiProperty({ description: '菜单树（动态路由依据）', type: [ProfileMenuDto] })
  menus: ProfileMenuDto[];
}
