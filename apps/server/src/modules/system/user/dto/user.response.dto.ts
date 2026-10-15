import { ApiProperty } from '@nestjs/swagger';
import { Status } from '@prisma/client';

/** 出参 DTO：显式白名单字段，绝不包含 password 等敏感字段 */
export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
  @ApiProperty() nickname: string;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) deptId: string | null;
  @ApiProperty({ nullable: true }) deptName: string | null;
  @ApiProperty({ enum: Status }) status: Status;
  @ApiProperty() isSuper: boolean;
  @ApiProperty({ description: '角色编码集合', type: [String] }) roles: string[];
  @ApiProperty() createdAt: Date;
}
