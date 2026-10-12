import { Injectable } from '@nestjs/common';
import { SysDept } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { ErrorCode } from '@/shared/constants/error-code';
import { BusinessException } from '@/shared/exceptions/business.exception';
import { buildTree } from '@/shared/utils/tree.util';

import { CreateDeptDto, DeptNodeDto, UpdateDeptDto } from './dto/dept.dto';

@Injectable()
export class DeptService {
  constructor(private readonly prisma: PrismaService) {}

  async tree(): Promise<DeptNodeDto[]> {
    const all = await this.prisma.sysDept.findMany({ orderBy: { sort: 'asc' } });
    return buildTree(all) as unknown as DeptNodeDto[];
  }

  async create(dto: CreateDeptDto): Promise<DeptNodeDto> {
    let ancestors = ',';
    if (dto.parentId) {
      const parent = await this.assertExists(dto.parentId);
      ancestors = `${parent.ancestors}${parent.id},`;
    }
    const dept = await this.prisma.sysDept.create({
      data: { name: dto.name, parentId: dto.parentId, sort: dto.sort ?? 0, ancestors },
    });
    return this.toNode(dept);
  }

  async update(id: string, dto: UpdateDeptDto): Promise<DeptNodeDto> {
    await this.assertExists(id);
    if (dto.parentId === id) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '父级部门不能是自身');
    }
    const dept = await this.prisma.sysDept.update({
      where: { id },
      data: { name: dto.name, sort: dto.sort, status: dto.status },
    });

    // 父级变化：重算本节点及整个子树的 ancestors
    if (dto.parentId !== undefined && dto.parentId !== dept.parentId) {
      const newAncestors = dto.parentId
        ? `${(await this.assertExists(dto.parentId)).ancestors}${dto.parentId},`
        : ',';
      await this.moveSubtree(id, dept.parentId, newAncestors);
    }
    return this.toNode(dept);
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    const children = await this.prisma.sysDept.count({ where: { parentId: id } });
    if (children > 0) throw new BusinessException(ErrorCode.DEPT_HAS_CHILDREN);
    const users = await this.prisma.sysUser.count({ where: { deptId: id, deletedAt: null } });
    if (users > 0) throw new BusinessException(ErrorCode.DEPT_HAS_USERS);
    await this.prisma.sysDept.delete({ where: { id } });
  }

  /** 移动子树：更新自身 parent/ancestors，并级联修正所有后代 */
  private async moveSubtree(id: string, newParentId: string | null, newAncestors: string) {
    const old = await this.assertExists(id);
    await this.prisma.sysDept.update({
      where: { id },
      data: { parentId: newParentId, ancestors: newAncestors },
    });
    // 后代节点的 ancestors 中，旧前缀片段整体替换为新前缀
    const descendants = await this.prisma.sysDept.findMany({
      where: { ancestors: { contains: `,${id},` } },
    });
    for (const node of descendants) {
      const suffix = node.ancestors.slice(old.ancestors.length + id.length + 1);
      await this.prisma.sysDept.update({
        where: { id: node.id },
        data: { ancestors: `${newAncestors}${id},${suffix}` },
      });
    }
  }

  private async assertExists(id: string): Promise<SysDept> {
    const dept = await this.prisma.sysDept.findUnique({ where: { id } });
    if (!dept) throw new BusinessException(ErrorCode.DEPT_NOT_FOUND);
    return dept;
  }

  private toNode(dept: SysDept): DeptNodeDto {
    return {
      id: dept.id,
      parentId: dept.parentId,
      name: dept.name,
      sort: dept.sort,
      status: dept.status,
      createdAt: dept.createdAt,
      children: [],
    };
  }
}
