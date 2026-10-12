import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: '新密码（至少 6 位）' })
  @IsString()
  @Length(6, 64)
  password: string;
}
