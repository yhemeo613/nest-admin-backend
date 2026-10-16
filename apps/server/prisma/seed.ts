import { DataScope, PermType, PrismaClient, Status } from '@prisma/client';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';

// 与 src/shared/constants/permission-code.ts 保持一致（单一事实来源是代码常量）
import { PermissionCode } from '../src/shared/constants/permission-code';

loadEnv({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env.development' });
loadEnv();

const prisma = new PrismaClient();

/** 权限树节点：code 即 PermissionCode，parentCode 描述树形关系 */
interface PermSeed {
  name: string;
  code: string;
  type: PermType;
  parentCode?: string;
  path?: string;
  icon?: string;
  sort?: number;
  isHidden?: boolean; // 隐藏菜单：路由注册但不进侧栏（详情页）
}

const PERMISSION_TREE: PermSeed[] = [
  // ---------- 系统管理 ----------
  {
    name: '系统管理',
    code: PermissionCode.SystemMenu,
    type: PermType.DIR,
    path: '/system',
    icon: 'ri:settings-3-line',
    sort: 900,
  },
  {
    name: '用户管理',
    code: PermissionCode.SystemUserMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.SystemMenu,
    path: '/system/user',
    sort: 1,
  },
  {
    name: '用户查询',
    code: PermissionCode.SystemUserList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemUserMenu,
  },
  {
    name: '用户新增',
    code: PermissionCode.SystemUserCreate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemUserMenu,
  },
  {
    name: '用户修改',
    code: PermissionCode.SystemUserUpdate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemUserMenu,
  },
  {
    name: '用户删除',
    code: PermissionCode.SystemUserDelete,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemUserMenu,
  },
  {
    name: '重置密码',
    code: PermissionCode.SystemUserResetPassword,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemUserMenu,
  },
  {
    name: '分配角色',
    code: PermissionCode.SystemUserAssignRoles,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemUserMenu,
  },
  {
    name: '角色管理',
    code: PermissionCode.SystemRoleMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.SystemMenu,
    path: '/system/role',
    sort: 2,
  },
  {
    name: '角色查询',
    code: PermissionCode.SystemRoleList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemRoleMenu,
  },
  {
    name: '角色新增',
    code: PermissionCode.SystemRoleCreate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemRoleMenu,
  },
  {
    name: '角色修改',
    code: PermissionCode.SystemRoleUpdate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemRoleMenu,
  },
  {
    name: '角色删除',
    code: PermissionCode.SystemRoleDelete,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemRoleMenu,
  },
  {
    name: '分配权限',
    code: PermissionCode.SystemRoleAssignPerms,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemRoleMenu,
  },
  {
    name: '权限管理',
    code: PermissionCode.SystemPermissionMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.SystemMenu,
    path: '/system/menu',
    sort: 3,
  },
  {
    name: '权限查询',
    code: PermissionCode.SystemPermissionList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemPermissionMenu,
  },
  {
    name: '权限新增',
    code: PermissionCode.SystemPermissionCreate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemPermissionMenu,
  },
  {
    name: '权限修改',
    code: PermissionCode.SystemPermissionUpdate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemPermissionMenu,
  },
  {
    name: '权限删除',
    code: PermissionCode.SystemPermissionDelete,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemPermissionMenu,
  },
  {
    name: '部门管理',
    code: PermissionCode.SystemDeptMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.SystemMenu,
    path: '/system/dept',
    sort: 4,
  },
  {
    name: '部门查询',
    code: PermissionCode.SystemDeptList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemDeptMenu,
  },
  {
    name: '部门新增',
    code: PermissionCode.SystemDeptCreate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemDeptMenu,
  },
  {
    name: '部门修改',
    code: PermissionCode.SystemDeptUpdate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemDeptMenu,
  },
  {
    name: '部门删除',
    code: PermissionCode.SystemDeptDelete,
    type: PermType.BUTTON,
    parentCode: PermissionCode.SystemDeptMenu,
  },
  // ---------- 代码评审（NestReview） ----------
  {
    name: '代码评审',
    code: PermissionCode.ReviewMenu,
    type: PermType.DIR,
    path: '/review',
    icon: 'ri:file-search-line',
    sort: 100,
  },
  {
    name: '评审工作台',
    code: PermissionCode.ReviewDashboardMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.ReviewMenu,
    path: '/review/dashboard',
    sort: 1,
  },
  {
    name: '工作台查询',
    code: PermissionCode.ReviewDashboardQuery,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewDashboardMenu,
  },
  {
    name: '评审任务',
    code: PermissionCode.ReviewTaskMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.ReviewMenu,
    path: '/review/task',
    sort: 2,
  },
  {
    // 任务详情挂在 /review 下（与 task 平级）而非 task 的子节点：
    // 作为 task 的子路由需要 task/index.vue 提供 <router-view>，列表页没有 → 详情页渲染不出
    name: '任务详情',
    code: PermissionCode.ReviewTaskDetail,
    type: PermType.MENU,
    parentCode: PermissionCode.ReviewMenu,
    path: '/review/task/detail',
    sort: 99,
    isHidden: true,
  },
  {
    name: '任务查询',
    code: PermissionCode.ReviewTaskList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewTaskMenu,
  },
  {
    name: '发起评审',
    code: PermissionCode.ReviewTaskCreate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewTaskMenu,
  },
  {
    name: '取消任务',
    code: PermissionCode.ReviewTaskCancel,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewTaskMenu,
  },
  {
    name: '重跑任务',
    code: PermissionCode.ReviewTaskRerun,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewTaskMenu,
  },
  {
    name: '回写 MR',
    code: PermissionCode.ReviewTaskPublish,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewTaskMenu,
  },
  {
    name: '发现处理',
    code: PermissionCode.ReviewFindingUpdate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewTaskMenu,
  },
  {
    name: '仓库管理',
    code: PermissionCode.ReviewRepoMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.ReviewMenu,
    path: '/review/repo',
    sort: 3,
  },
  {
    name: '仓库查询',
    code: PermissionCode.ReviewRepoList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewRepoMenu,
  },
  {
    name: '仓库新增',
    code: PermissionCode.ReviewRepoCreate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewRepoMenu,
  },
  {
    name: '仓库修改',
    code: PermissionCode.ReviewRepoEdit,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewRepoMenu,
  },
  {
    name: '仓库删除',
    code: PermissionCode.ReviewRepoDelete,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewRepoMenu,
  },
  {
    name: '仓库同步',
    code: PermissionCode.ReviewRepoSync,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewRepoMenu,
  },
  {
    name: '模型配置',
    code: PermissionCode.ReviewModelMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.ReviewMenu,
    path: '/review/model',
    sort: 4,
  },
  {
    name: '模型查询',
    code: PermissionCode.ReviewModelList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewModelMenu,
  },
  {
    name: '模型新增',
    code: PermissionCode.ReviewModelCreate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewModelMenu,
  },
  {
    name: '模型修改',
    code: PermissionCode.ReviewModelEdit,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewModelMenu,
  },
  {
    name: '模型删除',
    code: PermissionCode.ReviewModelDelete,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewModelMenu,
  },
  {
    name: '模型测连',
    code: PermissionCode.ReviewModelTest,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewModelMenu,
  },
  {
    name: '质量红线',
    code: PermissionCode.ReviewGateMenu,
    type: PermType.MENU,
    parentCode: PermissionCode.ReviewMenu,
    path: '/review/gate',
    sort: 5,
  },
  {
    name: '红线查询',
    code: PermissionCode.ReviewGateList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewGateMenu,
  },
  {
    name: '红线配置',
    code: PermissionCode.ReviewGateEdit,
    type: PermType.BUTTON,
    parentCode: PermissionCode.ReviewGateMenu,
  },
];

async function seedPermissions(): Promise<Map<string, string>> {
  const codeToId = new Map<string, string>();
  // 清理已下线的功能遗留权限码（工作台/AI/SaaS 客服等），避免超管菜单残留死链
  const validCodes = new Set(PERMISSION_TREE.map((n) => n.code));
  const existing = await prisma.sysPermission.findMany({ select: { id: true, code: true } });
  const staleIds = existing.filter((p) => !validCodes.has(p.code)).map((p) => p.id);
  if (staleIds.length > 0) {
    await prisma.sysRolePermission.deleteMany({ where: { permissionId: { in: staleIds } } });
    await prisma.sysPermission.deleteMany({ where: { id: { in: staleIds } } });
    console.log(`    清理遗留权限码 ${staleIds.length} 个`);
  }
  // 两遍插入：先 upsert 所有节点，再回填父子关系
  for (const node of PERMISSION_TREE) {
    const saved = await prisma.sysPermission.upsert({
      where: { code: node.code },
      update: {
        name: node.name,
        type: node.type,
        path: node.path,
        // ?? null：Prisma 会跳过 undefined，显式 null 才能清掉旧库里残留的图标
        icon: node.icon ?? null,
        sort: node.sort ?? 0,
        isHidden: node.isHidden ?? false,
      },
      create: {
        name: node.name,
        code: node.code,
        type: node.type,
        path: node.path,
        icon: node.icon ?? null,
        sort: node.sort ?? 0,
        isHidden: node.isHidden ?? false,
      },
    });
    codeToId.set(node.code, saved.id);
  }
  for (const node of PERMISSION_TREE) {
    if (!node.parentCode) continue;
    await prisma.sysPermission.update({
      where: { code: node.code },
      data: { parentId: codeToId.get(node.parentCode) },
    });
  }
  return codeToId;
}

async function seedDepts(): Promise<string> {
  const root = await prisma.sysDept.upsert({
    where: { id: 'root-dept-fixed-id' },
    update: {},
    create: { id: 'root-dept-fixed-id', name: '总公司', ancestors: ',', sort: 0 },
  });
  await prisma.sysDept.upsert({
    where: { id: 'tech-dept-fixed-id' },
    update: {},
    create: {
      id: 'tech-dept-fixed-id',
      name: '技术部',
      parentId: root.id,
      ancestors: `,${root.id},`,
      sort: 1,
    },
  });
  return root.id;
}

async function seedRoles(allPermIds: string[]): Promise<void> {
  const admin = await prisma.sysRole.upsert({
    where: { code: 'admin' },
    update: { dataScope: DataScope.ALL },
    create: { code: 'admin', name: '超级管理员', dataScope: DataScope.ALL, sort: 1 },
  });
  // 幂等：全量对齐 admin 角色的权限
  await prisma.sysRolePermission.deleteMany({ where: { roleId: admin.id } });
  await prisma.sysRolePermission.createMany({
    data: allPermIds.map((permissionId) => ({ roleId: admin.id, permissionId })),
  });

  const common = await prisma.sysRole.upsert({
    where: { code: 'common' },
    update: {},
    create: { code: 'common', name: '普通用户', dataScope: DataScope.SELF, sort: 10 },
  });
  // 菜单码 + 查询按钮码：菜单码用于前端菜单可见性，按钮码用于接口鉴权（只读演示角色）
  const commonPermCodes = [
    PermissionCode.SystemMenu,
    PermissionCode.SystemUserMenu,
    PermissionCode.SystemRoleMenu,
    PermissionCode.SystemPermissionMenu,
    PermissionCode.SystemDeptMenu,
    PermissionCode.SystemUserList,
    PermissionCode.SystemRoleList,
    PermissionCode.SystemPermissionList,
    PermissionCode.SystemDeptList,
    // 代码评审只读（菜单可见 + 查询/详情；隐藏详情页靠 isHidden 不进侧栏，但路由可达）
    PermissionCode.ReviewMenu,
    PermissionCode.ReviewDashboardMenu,
    PermissionCode.ReviewTaskMenu,
    PermissionCode.ReviewTaskDetail,
    PermissionCode.ReviewRepoMenu,
    PermissionCode.ReviewModelMenu,
    PermissionCode.ReviewGateMenu,
    PermissionCode.ReviewDashboardQuery,
    PermissionCode.ReviewTaskList,
    PermissionCode.ReviewRepoList,
    PermissionCode.ReviewModelList,
    PermissionCode.ReviewGateList,
  ];
  const commonPerms = await prisma.sysPermission.findMany({
    where: { code: { in: commonPermCodes } },
  });
  await prisma.sysRolePermission.deleteMany({ where: { roleId: common.id } });
  await prisma.sysRolePermission.createMany({
    data: commonPerms.map((p) => ({ roleId: common.id, permissionId: p.id })),
  });

  // 清理历史遗留的租户管理员角色（客服系统已下线）
  const legacyRole = await prisma.sysRole.findUnique({ where: { code: 'tenant_admin' } });
  if (legacyRole) {
    await prisma.sysRolePermission.deleteMany({ where: { roleId: legacyRole.id } });
    await prisma.sysRole.delete({ where: { id: legacyRole.id } });
  }
}

async function seedUsers(rootDeptId: string): Promise<void> {
  const adminRole = await prisma.sysRole.findUniqueOrThrow({ where: { code: 'admin' } });
  const commonRole = await prisma.sysRole.findUniqueOrThrow({ where: { code: 'common' } });

  const admin = await prisma.sysUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: await argon2.hash('Admin@123'),
      nickname: '系统管理员',
      isSuper: true,
      deptId: rootDeptId,
      status: Status.ENABLED,
    },
  });
  await prisma.sysUserRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  const demo = await prisma.sysUser.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      password: await argon2.hash('Demo@123'),
      nickname: '演示用户',
      deptId: rootDeptId,
      status: Status.ENABLED,
    },
  });
  await prisma.sysUserRole.upsert({
    where: { userId_roleId: { userId: demo.id, roleId: commonRole.id } },
    update: {},
    create: { userId: demo.id, roleId: commonRole.id },
  });
}

async function main(): Promise<void> {
  console.log('==> 初始化权限树...');
  const codeToId = await seedPermissions();
  console.log(`    权限点 ${codeToId.size} 个`);
  console.log('==> 初始化部门...');
  const rootDeptId = await seedDepts();
  console.log('==> 初始化角色...');
  await seedRoles([...codeToId.values()]);
  console.log('==> 初始化用户...');
  await seedUsers(rootDeptId);
  console.log('==> 完成。内置账号：admin/Admin@123（超管）、demo/Demo@123（普通用户）');
}

main()
  .catch((e) => {
    console.error('seed 失败：', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
