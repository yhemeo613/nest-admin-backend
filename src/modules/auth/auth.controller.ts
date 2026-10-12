import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '@/shared/decorators/current-user.decorator';
import { Public } from '@/shared/decorators/public.decorator';
import { AuthUser } from '@/shared/types/auth-user';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ProfileDto, TokenPairDto } from './dto/profile.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: '登录（限流 5 次/分钟）' })
  login(@Body() dto: LoginDto): Promise<TokenPairDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新令牌（旋转，旧凭据即刻作废）' })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairDto> {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '登出' })
  async logout(@CurrentUser() user: AuthUser): Promise<null> {
    await this.authService.logout(user.userId);
    return null;
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前用户档案（用户/角色/权限码/菜单树）' })
  profile(@CurrentUser() user: AuthUser): Promise<ProfileDto> {
    return this.authService.profile(user.userId);
  }
}
