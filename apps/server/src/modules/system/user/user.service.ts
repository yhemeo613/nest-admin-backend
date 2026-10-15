import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Status, SysDept, SysRole, SysUser, SysUserRole } from '@prisma/client';
import * as argon2 from 'argon2';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { RedisService } from '@/infra/redis/redis.service';
import { CacheKey, PermCacheEvent } from '@/shared/constants/cache-key';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';

import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user.response.dto';

type UserWithRelations = SysUser & {
  dept?: SysDept | null;
  roles?: (SysUserRole & { role: SysRole })[];
};

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateUserDto, operatorId?: string): Promise<UserResponseDto> {
    const exists = await this.prisma.sysUser.findUnique({ where: { username: dto.username } });
    if (exists) throw new BusinessException(ErrorCode.USERNAME_EXISTS);

    const user = await this.prisma.sysUser.create({
      data: {
        username: dto.username,
        password: await argon2.hash(dto.password),
        nickname: dto.nickname,
        email: dto.email,
        phone: dto.phone,
        deptId: dto.deptId,
        createdBy: operatorId,
        roles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      include: { dept: true, roles: { include: { role: true } } },
    });
    return this.toResponse(user);
  }

  async findAll(
    query: QueryUserDto,
    scopeFilter: Record<string, unknown>,
  ): Promise<PageResult<UserResponseDto>> {
    const businessWhere: Prisma.SysUserWhereInput = {
      deletedAt: null,
      ...(query.keyword
        ? {
            OR: [
              { username: { contains: query.keyword, mode: 'insensitive' } },
              { nickname: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.deptId ? { deptId: query.deptId } : {}),
    };
    // 数据权限条件与业务条件 AND 合并
    const where: Prisma.SysUserWhereInput = {
      AND: [businessWhere, scopeFilter as Prisma.SysUserWhereInput],
    };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.sysUser.findMany({
        where,
        ...toSkipTake(query),
        orderBy: { createdAt: 'desc' },
        include: { dept: true, roles: { include: { role: true } } },
      }),
      this.prisma.sysUser.count({ where }),
    ]);
    return toPageResult(
      list.map((u) => this.toResponse(u)),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.sysUser.findFirst({
      where: { id, deletedAt: null },
      include: { dept: true, roles: { include: { role: true } } },
    });
    if (!user) throw new BusinessException(ErrorCode.USER_NOT_FOUND);
    return this.toResponse(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    await this.assertExists(id);
    const user = await this.prisma.sysUser.update({
      where: { id },
      data: {
        nickname: dto.nickname,
        email: dto.email,
        phone: dto.phone,
        deptId: dto.deptId,
      },
      include: { dept: true, roles: { include: { role: true } } },
    });
    return this.toResponse(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.assertExists(id);
    if (user.isSuper) throw new BusinessException(ErrorCode.FORBIDDEN, '超级管理员不允许删除');
    await this.prisma.sysUser.update({ where: { id }, data: { deletedAt: new Date() } });
    // 删除即下线：吊销刷新凭据 + 清权限缓存
    await this.redis.del(CacheKey.refreshToken(id));
    this.eventEmitter.emit(PermCacheEvent.invalidateUser, { userId: id });
  }

  async assignRoles(id: string, dto: AssignRolesDto): Promise<void> {
    await this.assertExists(id);
    const roles = await this.prisma.sysRole.findMany({ where: { id: { in: dto.roleIds } } });
    if (roles.length !== dto.roleIds.length) {
      throw new BusinessException(ErrorCode.ROLE_NOT_FOUND, '部分角色不存在');
    }
    await this.prisma.$transaction([
      this.prisma.sysUserRole.deleteMany({ where: { userId: id } }),
      this.prisma.sysUserRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
      }),
    ]);
    // 权限变更即时生效
    this.eventEmitter.emit(PermCacheEvent.invalidateUser, { userId: id });
  }

  async resetPassword(id: string, dto: ResetPasswordDto): Promise<void> {
    await this.assertExists(id);
    await this.prisma.sysUser.update({
      where: { id },
      data: { password: await argon2.hash(dto.password) },
    });
    // 重置密码后强制重新登录
    await this.redis.del(CacheKey.refreshToken(id));
  }

  async updateStatus(id: string, status: Status): Promise<void> {
    const user = await this.assertExists(id);
    if (user.isSuper) throw new BusinessException(ErrorCode.FORBIDDEN, '超级管理员不允许禁用');
    await this.prisma.sysUser.update({ where: { id }, data: { status } });
    if (status === Status.DISABLED) {
      await this.redis.del(CacheKey.refreshToken(id));
    }
    this.eventEmitter.emit(PermCacheEvent.invalidateUser, { userId: id });
  }

  private async assertExists(id: string): Promise<SysUser> {
    const user = await this.prisma.sysUser.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new BusinessException(ErrorCode.USER_NOT_FOUND);
    return user;
  }

  private toResponse(user: UserWithRelations): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      deptId: user.deptId,
      deptName: user.dept?.name ?? null,
      status: user.status,
      isSuper: user.isSuper,
      roles: (user.roles ?? []).map((ur) => ur.role.code),
      createdAt: user.createdAt,
    };
  }
}
