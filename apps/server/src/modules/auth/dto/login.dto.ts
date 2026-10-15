import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 32)
  username: string;

  @ApiProperty({ description: '密码', example: 'Admin@123' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 64)
  password: string;
}
