import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, SysRole, SysRoleDept, SysRolePermission } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { PermCacheEvent } from '@/shared/constants/cache-key';
import { ErrorCode } from '@/shared/constants/error-code';
import { PageResult, toPageResult, toSkipTake } from '@/shared/dto/pagination.dto';
import { BusinessException } from '@/shared/exceptions/business.exception';

import {
  AssignPermissionsDto,
  CreateRoleDto,
  QueryRoleDto,
  RoleResponseDto,
  SetDataScopeDto,
  UpdateRoleDto,
} from './dto/role.dto';

type RoleWithRelations = SysRole & {
  perms?: SysRolePermission[];
  depts?: SysRoleDept[];
};

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateRoleDto): Promise<RoleResponseDto> {
    const exists = await this.prisma.sysRole.findUnique({ where: { code: dto.code } });
    if (exists) throw new BusinessException(ErrorCode.ROLE_CODE_EXISTS);

    const role = await this.prisma.sysRole.create({
      data: {
        code: dto.code,
        name: dto.name,
        dataScope: dto.dataScope,
        sort: dto.sort ?? 0,
        remark: dto.remark,
        depts: dto.deptIds?.length
          ? { create: dto.deptIds.map((deptId) => ({ deptId })) }
          : undefined,
      },
      include: { perms: true, depts: true },
    });
    return this.toResponse(role);
  }

  async findAll(query: QueryRoleDto): Promise<PageResult<RoleResponseDto>> {
    const where: Prisma.SysRoleWhereInput = {
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { name: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.sysRole.findMany({
        where,
        ...toSkipTake(query),
        orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
        include: { perms: true, depts: true },
      }),
      this.prisma.sysRole.count({ where }),
    ]);
    return toPageResult(
      list.map((r) => this.toResponse(r)),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<RoleResponseDto> {
    const role = await this.prisma.sysRole.findUnique({
      where: { id },
      include: { perms: true, depts: true },
    });
    if (!role) throw new BusinessException(ErrorCode.ROLE_NOT_FOUND);
    return this.toResponse(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleResponseDto> {
    await this.assertExists(id);
    if (dto.code) {
      const conflict = await this.prisma.sysRole.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (conflict) throw new BusinessException(ErrorCode.ROLE_CODE_EXISTS);
    }
    const role = await this.prisma.sysRole.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        sort: dto.sort,
        remark: dto.remark,
      },
      include: { perms: true, depts: true },
    });
    this.eventEmitter.emit(PermCacheEvent.invalidateRole, { roleId: id });
    return this.toResponse(role);
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    const boundUsers = await this.prisma.sysUserRole.count({ where: { roleId: id } });
    if (boundUsers > 0) throw new BusinessException(ErrorCode.ROLE_IN_USE);
    await this.prisma.sysRole.delete({ where: { id } });
    this.eventEmitter.emit(PermCacheEvent.invalidateRole, { roleId: id });
  }

  /** 分配权限点（全量对齐），相关用户缓存即时失效 */
  async assignPermissions(id: string, dto: AssignPermissionsDto): Promise<void> {
    await this.assertExists(id);
    const perms = await this.prisma.sysPermission.findMany({
      where: { id: { in: dto.permissionIds } },
      select: { id: true },
    });
    if (perms.length !== dto.permissionIds.length) {
      throw new BusinessException(ErrorCode.PERMISSION_NOT_FOUND, '部分权限点不存在');
    }
    await this.prisma.$transaction([
      this.prisma.sysRolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.sysRolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      }),
    ]);
    this.eventEmitter.emit(PermCacheEvent.invalidateRole, { roleId: id });
  }

  /** 配置数据权限范围（CUSTOM 时同步部门集合） */
  async setDataScope(id: string, dto: SetDataScopeDto): Promise<void> {
    await this.assertExists(id);
    await this.prisma.$transaction([
      this.prisma.sysRole.update({ where: { id }, data: { dataScope: dto.dataScope } }),
      this.prisma.sysRoleDept.deleteMany({ where: { roleId: id } }),
      ...(dto.dataScope === 'CUSTOM' && dto.deptIds?.length
        ? [
            this.prisma.sysRoleDept.createMany({
              data: dto.deptIds.map((deptId) => ({ roleId: id, deptId })),
            }),
          ]
        : []),
    ]);
    this.eventEmitter.emit(PermCacheEvent.invalidateRole, { roleId: id });
  }

  private async assertExists(id: string): Promise<SysRole> {
    const role = await this.prisma.sysRole.findUnique({ where: { id } });
    if (!role) throw new BusinessException(ErrorCode.ROLE_NOT_FOUND);
    return role;
  }

  private toResponse(role: RoleWithRelations): RoleResponseDto {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      dataScope: role.dataScope,
      status: role.status,
      sort: role.sort,
      remark: role.remark,
      permissionIds: (role.perms ?? []).map((p) => p.permissionId),
      deptIds: (role.depts ?? []).map((d) => d.deptId),
      createdAt: role.createdAt,
    };
  }
}
