import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsUUID } from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({ description: '角色 ID 集合', type: [String] })
  @IsUUID(undefined, { each: true })
  @ArrayNotEmpty()
  roleIds: string[];
}
