import { DataScope } from '@prisma/client';

import { AuthUser } from '@/shared/types/auth-user';

import { DataScopeService } from './data-scope.service';

/** 数据行级权限：各 dataScope 组合下的 where 片段生成 */
describe('DataScopeService（数据行级权限）', () => {
  let service: DataScopeService;

  const user: AuthUser = {
    userId: 'u1',
    username: 'demo',
    nickname: '演示',
    isSuper: false,
    deptId: 'dept-1',
  };
  const options = { deptField: 'deptId', ownerField: 'createdBy' };

  const buildWithRoles = (
    roles: { dataScope: DataScope; deptIds?: string[] }[],
    deptChildren: string[] = [],
  ) => {
    const prisma = {
      sysUserRole: {
        findMany: jest.fn().mockResolvedValue(
          roles.map((r) => ({
            role: {
              dataScope: r.dataScope,
              depts: (r.deptIds ?? []).map((deptId) => ({ deptId })),
            },
          })),
        ),
      },
      sysDept: {
        findMany: jest.fn().mockResolvedValue(deptChildren.map((id) => ({ id }))),
      },
    };
    const redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    service = new DataScopeService(prisma as never, redis as never);
    return service.buildFilter(user, options);
  };

  it('超级管理员：不加任何过滤', async () => {
    const prisma = { sysUserRole: { findMany: jest.fn() }, sysDept: { findMany: jest.fn() } };
    const redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    service = new DataScopeService(prisma as never, redis as never);
    const result = await service.buildFilter({ ...user, isSuper: true }, options);
    expect(result).toEqual({});
    expect(prisma.sysUserRole.findMany).not.toHaveBeenCalled();
  });

  it('ALL 角色：不加任何过滤', async () => {
    const result = await buildWithRoles([{ dataScope: DataScope.ALL }]);
    expect(result).toEqual({});
  });

  it('SELF 角色：仅本人数据', async () => {
    const result = await buildWithRoles([{ dataScope: DataScope.SELF }]);
    expect(result).toEqual({ OR: [{ createdBy: 'u1' }] });
  });

  it('DEPT 角色：仅本部门', async () => {
    const result = await buildWithRoles([{ dataScope: DataScope.DEPT }]);
    expect(result).toEqual({ OR: [{ deptId: { in: ['dept-1'] } }] });
  });

  it('DEPT_AND_CHILDREN 角色：本部门 + 子部门', async () => {
    const result = await buildWithRoles(
      [{ dataScope: DataScope.DEPT_AND_CHILDREN }],
      ['dept-2', 'dept-3'],
    );
    expect(result).toEqual({
      OR: [{ deptId: { in: expect.arrayContaining(['dept-1', 'dept-2', 'dept-3']) } }],
    });
  });

  it('CUSTOM 角色：指定部门集合', async () => {
    const result = await buildWithRoles([
      { dataScope: DataScope.CUSTOM, deptIds: ['dept-a', 'dept-b'] },
    ]);
    expect(result).toEqual({ OR: [{ deptId: { in: ['dept-a', 'dept-b'] } }] });
  });

  it('多角色并集：SELF + DEPT 取 OR', async () => {
    const result = await buildWithRoles([
      { dataScope: DataScope.SELF },
      { dataScope: DataScope.DEPT },
    ]);
    expect(result).toEqual({
      OR: [{ deptId: { in: ['dept-1'] } }, { createdBy: 'u1' }],
    });
  });

  it('无有效范围时兜底为仅本人', async () => {
    const prisma = {
      sysUserRole: { findMany: jest.fn().mockResolvedValue([]) },
      sysDept: { findMany: jest.fn() },
    };
    const redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    service = new DataScopeService(prisma as never, redis as never);
    const result = await service.buildFilter({ ...user, deptId: null }, options);
    expect(result).toEqual({ createdBy: 'u1' });
  });
});
