import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty({ type: () => [ProfileMenuDto] }) children: ProfileMenuDto[];
}

export class ProfileDto {
  @ApiProperty({ description: '用户基本信息' })
  user: {
    id: string;
    username: string;
    nickname: string;
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
