import { DataScope, PermType, PrismaClient, Status } from '@prisma/client';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';

import {
  AiProtocol,
  PROVIDER_BASE_URLS,
  PROVIDER_DISPLAY_NAMES,
} from '../src/infra/ai/ai.constants';
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
}

const PERMISSION_TREE: PermSeed[] = [
  // ---------- 工作台 ----------
  {
    name: '工作台',
    code: 'dashboard',
    type: PermType.MENU,
    path: '/dashboard/console',
    icon: 'ri:home-smile-line',
    sort: 1,
  },
  // ---------- 系统管理 ----------
  {
    name: '系统管理',
    code: 'system',
    type: PermType.DIR,
    path: '/system',
    icon: 'ri:settings-3-line',
    sort: 100,
  },
  {
    name: '用户管理',
    code: 'system:user',
    type: PermType.MENU,
    parentCode: 'system',
    path: '/system/user',
    sort: 1,
  },
  {
    name: '用户查询',
    code: PermissionCode.SystemUserList,
    type: PermType.BUTTON,
    parentCode: 'system:user',
  },
  {
    name: '用户新增',
    code: PermissionCode.SystemUserCreate,
    type: PermType.BUTTON,
    parentCode: 'system:user',
  },
  {
    name: '用户修改',
    code: PermissionCode.SystemUserUpdate,
    type: PermType.BUTTON,
    parentCode: 'system:user',
  },
  {
    name: '用户删除',
    code: PermissionCode.SystemUserDelete,
    type: PermType.BUTTON,
    parentCode: 'system:user',
  },
  {
    name: '重置密码',
    code: PermissionCode.SystemUserResetPassword,
    type: PermType.BUTTON,
    parentCode: 'system:user',
  },
  {
    name: '分配角色',
    code: PermissionCode.SystemUserAssignRoles,
    type: PermType.BUTTON,
    parentCode: 'system:user',
  },
  {
    name: '角色管理',
    code: 'system:role',
    type: PermType.MENU,
    parentCode: 'system',
    path: '/system/role',
    sort: 2,
  },
  {
    name: '角色查询',
    code: PermissionCode.SystemRoleList,
    type: PermType.BUTTON,
    parentCode: 'system:role',
  },
  {
    name: '角色新增',
    code: PermissionCode.SystemRoleCreate,
    type: PermType.BUTTON,
    parentCode: 'system:role',
  },
  {
    name: '角色修改',
    code: PermissionCode.SystemRoleUpdate,
    type: PermType.BUTTON,
    parentCode: 'system:role',
  },
  {
    name: '角色删除',
    code: PermissionCode.SystemRoleDelete,
    type: PermType.BUTTON,
    parentCode: 'system:role',
  },
  {
    name: '分配权限',
    code: PermissionCode.SystemRoleAssignPerms,
    type: PermType.BUTTON,
    parentCode: 'system:role',
  },
  {
    name: '权限管理',
    code: 'system:permission',
    type: PermType.MENU,
    parentCode: 'system',
    path: '/system/menu',
    sort: 3,
  },
  {
    name: '权限查询',
    code: PermissionCode.SystemPermissionList,
    type: PermType.BUTTON,
    parentCode: 'system:permission',
  },
  {
    name: '权限新增',
    code: PermissionCode.SystemPermissionCreate,
    type: PermType.BUTTON,
    parentCode: 'system:permission',
  },
  {
    name: '权限修改',
    code: PermissionCode.SystemPermissionUpdate,
    type: PermType.BUTTON,
    parentCode: 'system:permission',
  },
  {
    name: '权限删除',
    code: PermissionCode.SystemPermissionDelete,
    type: PermType.BUTTON,
    parentCode: 'system:permission',
  },
  {
    name: '部门管理',
    code: 'system:dept',
    type: PermType.MENU,
    parentCode: 'system',
    path: '/system/dept',
    sort: 4,
  },
  {
    name: '部门查询',
    code: PermissionCode.SystemDeptList,
    type: PermType.BUTTON,
    parentCode: 'system:dept',
  },
  {
    name: '部门新增',
    code: PermissionCode.SystemDeptCreate,
    type: PermType.BUTTON,
    parentCode: 'system:dept',
  },
  {
    name: '部门修改',
    code: PermissionCode.SystemDeptUpdate,
    type: PermType.BUTTON,
    parentCode: 'system:dept',
  },
  {
    name: '部门删除',
    code: PermissionCode.SystemDeptDelete,
    type: PermType.BUTTON,
    parentCode: 'system:dept',
  },
  // ---------- AI 应用 ----------
  {
    name: 'AI 应用',
    code: 'ai',
    type: PermType.DIR,
    path: '/ai',
    icon: 'ri:robot-line',
    sort: 200,
  },
  {
    name: 'AI 问答',
    code: 'ai:chat',
    type: PermType.MENU,
    parentCode: 'ai',
    path: '/ai/chat',
    sort: 1,
  },
  {
    name: '发起对话',
    code: PermissionCode.AiChatAsk,
    type: PermType.BUTTON,
    parentCode: 'ai:chat',
  },
  {
    name: '对话历史',
    code: PermissionCode.AiChatHistory,
    type: PermType.BUTTON,
    parentCode: 'ai:chat',
  },
  {
    name: '用量报表',
    code: 'ai:usage',
    type: PermType.MENU,
    parentCode: 'ai',
    path: '/ai/usage',
    sort: 3,
  },
  {
    name: '用量查询',
    code: PermissionCode.AiUsageList,
    type: PermType.BUTTON,
    parentCode: 'ai:usage',
  },
  // ---------- AI 模型配置（供应商/模型自定义） ----------
  {
    name: '模型配置',
    code: PermissionCode.AiConfigMenu,
    type: PermType.MENU,
    parentCode: 'ai',
    path: '/ai/config',
    sort: 2,
  },
  {
    name: '配置查询',
    code: PermissionCode.AiConfigList,
    type: PermType.BUTTON,
    parentCode: PermissionCode.AiConfigMenu,
  },
  {
    name: '配置新增',
    code: PermissionCode.AiConfigCreate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.AiConfigMenu,
  },
  {
    name: '配置修改',
    code: PermissionCode.AiConfigUpdate,
    type: PermType.BUTTON,
    parentCode: PermissionCode.AiConfigMenu,
  },
  {
    name: '配置删除',
    code: PermissionCode.AiConfigDelete,
    type: PermType.BUTTON,
    parentCode: PermissionCode.AiConfigMenu,
  },
];

async function seedPermissions(): Promise<Map<string, string>> {
  const codeToId = new Map<string, string>();
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
      },
      create: {
        name: node.name,
        code: node.code,
        type: node.type,
        path: node.path,
        icon: node.icon ?? null,
        sort: node.sort ?? 0,
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
  // 菜单码 + 按钮码：菜单码用于前端菜单可见性，按钮码用于接口鉴权
  const commonPermCodes = [
    PermissionCode.Dashboard,
    PermissionCode.AiChatMenu,
    PermissionCode.AiChatAsk,
    PermissionCode.AiChatHistory,
  ];
  const commonPerms = await prisma.sysPermission.findMany({
    where: { code: { in: commonPermCodes } },
  });
  await prisma.sysRolePermission.deleteMany({ where: { roleId: common.id } });
  await prisma.sysRolePermission.createMany({
    data: commonPerms.map((p) => ({ roleId: common.id, permissionId: p.id })),
  });
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

/**
 * 从 env 引导创建默认供应商与模型（幂等，固定 ID）。
 * 数据库配置优先于 env：创建后可在「模型配置」页自由增删改，env 仅作初始值。
 */
async function seedAiProvider(): Promise<void> {
  const providerKey = process.env.AI_PROVIDER ?? '';
  const model = process.env.AI_MODEL ?? '';
  if (!model || providerKey === 'mock' || !providerKey) return;

  const baseUrl = process.env.AI_BASE_URL || PROVIDER_BASE_URLS[providerKey] || '';
  if (!baseUrl) return;

  const protocol = providerKey === 'ollama' ? AiProtocol.OLLAMA : AiProtocol.OPENAI_COMPAT;
  const maxOutput = Number(process.env.AI_MAX_TOKENS) || 2048;

  const provider = await prisma.aiProvider.upsert({
    where: { id: 'seed-ai-provider-env' },
    update: {
      name: PROVIDER_DISPLAY_NAMES[providerKey] ?? providerKey,
      protocol,
      baseUrl,
      // env 有密钥才覆盖，避免部署环境把库里已配置的 Key 清空
      ...(process.env.AI_API_KEY ? { apiKey: process.env.AI_API_KEY } : {}),
    },
    create: {
      id: 'seed-ai-provider-env',
      name: PROVIDER_DISPLAY_NAMES[providerKey] ?? providerKey,
      protocol,
      baseUrl,
      apiKey: process.env.AI_API_KEY || null,
      remark: '由 seed 从 .env 引导创建（AI_PROVIDER / AI_MODEL），可在页面中修改',
      sort: 0,
    },
  });

  await prisma.aiModel.upsert({
    where: { id: 'seed-ai-model-default' },
    update: { name: model, maxOutput, isDefault: true },
    create: {
      id: 'seed-ai-model-default',
      providerId: provider.id,
      name: model,
      maxOutput,
      isDefault: true,
      sort: 0,
    },
  });

  const fallback = process.env.AI_FALLBACK_MODEL ?? '';
  if (fallback && fallback !== model) {
    await prisma.aiModel.upsert({
      where: { id: 'seed-ai-model-fallback' },
      update: { name: fallback, isDefault: false },
      create: {
        id: 'seed-ai-model-fallback',
        providerId: provider.id,
        name: fallback,
        maxOutput,
        isDefault: false,
        sort: 1,
      },
    });
  }
}

/**
 * 站内通知样本（固定 ID 幂等；重复 seed 不覆盖已读状态）。
 */
async function seedNotifications(): Promise<void> {
  const admin = await prisma.sysUser.findUnique({ where: { username: 'admin' } });
  const demo = await prisma.sysUser.findUnique({ where: { username: 'demo' } });
  if (!admin || !demo) return;

  const rows = [
    {
      id: 'seed-notify-1',
      userId: admin.id,
      type: 'NOTICE',
      title: '欢迎使用权限中枢',
      content: '系统已就绪：可从左侧菜单进入用户、角色、权限与 AI 模型配置。',
      link: '/dashboard/console',
    },
    {
      id: 'seed-notify-2',
      userId: admin.id,
      type: 'MESSAGE',
      title: '模型配置已接入',
      content: '供应商与模型现在可在「模型配置」页自定义，保存后即时生效。',
      link: '/ai/config',
    },
    {
      id: 'seed-notify-3',
      userId: admin.id,
      type: 'TODO',
      title: '核对近 7 天 AI 成本',
      content: '（示例待办）到用量报表检查成本是否在预算内。',
      link: '/ai/usage',
      readAt: new Date('2026-10-01T00:00:00'),
    },
    {
      id: 'seed-notify-4',
      userId: demo.id,
      type: 'NOTICE',
      title: 'AI 问答已开放',
      content: '你可以向米答提问了，支持流式输出与多轮对话。',
      link: '/ai/chat',
    },
    {
      id: 'seed-notify-5',
      userId: demo.id,
      type: 'MESSAGE',
      title: '演示账号说明',
      content: 'demo 账号仅拥有 AI 对话相关权限。',
      link: null,
    },
  ];

  for (const row of rows) {
    // update 不带 readAt：重复 seed 不会重置用户已读状态
    await prisma.sysNotification.upsert({
      where: { id: row.id },
      update: { title: row.title, content: row.content, link: row.link, userId: row.userId },
      create: { ...row, readAt: (row as { readAt?: Date }).readAt ?? null },
    });
  }
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
  console.log('==> 初始化 AI 供应商配置...');
  await seedAiProvider();
  console.log('==> 初始化站内通知样本...');
  await seedNotifications();
  console.log('==> 完成。内置账号：admin/Admin@123（超管）、demo/Demo@123（普通用户）');
}

main()
  .catch((e) => {
    console.error('seed 失败：', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
