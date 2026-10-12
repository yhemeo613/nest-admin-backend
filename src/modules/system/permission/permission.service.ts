import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SysPermission } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { PermCacheEvent } from '@/shared/constants/cache-key';
import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { buildTree } from '@/shared/utils/tree.util';

import { CreatePermissionDto, PermissionNodeDto, UpdatePermissionDto } from './dto/permission.dto';

@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 权限树（管理端分配用） */
  async tree(): Promise<PermissionNodeDto[]> {
    const all = await this.prisma.sysPermission.findMany({ orderBy: { sort: 'asc' } });
    return buildTree(all) as unknown as PermissionNodeDto[];
  }

  async create(dto: CreatePermissionDto): Promise<PermissionNodeDto> {
    const exists = await this.prisma.sysPermission.findUnique({ where: { code: dto.code } });
    if (exists) throw new BusinessException(ErrorCode.PERMISSION_CODE_EXISTS);
    const saved = await this.prisma.sysPermission.create({ data: dto });
    this.eventEmitter.emit(PermCacheEvent.invalidateAll);
    return this.toNode(saved);
  }

  async update(id: string, dto: UpdatePermissionDto): Promise<PermissionNodeDto> {
    await this.assertExists(id);
    if (dto.code) {
      const conflict = await this.prisma.sysPermission.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (conflict) throw new BusinessException(ErrorCode.PERMISSION_CODE_EXISTS);
    }
    const saved = await this.prisma.sysPermission.update({ where: { id }, data: dto });
    this.eventEmitter.emit(PermCacheEvent.invalidateAll);
    return this.toNode(saved);
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    const children = await this.prisma.sysPermission.count({ where: { parentId: id } });
    if (children > 0) throw new BusinessException(ErrorCode.PERMISSION_HAS_CHILDREN);
    const bound = await this.prisma.sysRolePermission.count({ where: { permissionId: id } });
    if (bound > 0) throw new BusinessException(ErrorCode.PERMISSION_IN_USE);
    await this.prisma.sysPermission.delete({ where: { id } });
    this.eventEmitter.emit(PermCacheEvent.invalidateAll);
  }

  private async assertExists(id: string): Promise<SysPermission> {
    const perm = await this.prisma.sysPermission.findUnique({ where: { id } });
    if (!perm) throw new BusinessException(ErrorCode.PERMISSION_NOT_FOUND);
    return perm;
  }

  private toNode(perm: SysPermission): PermissionNodeDto {
    return { ...perm, children: [] };
  }
}
