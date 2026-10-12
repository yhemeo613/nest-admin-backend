import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Status } from '@prisma/client';
import * as argon2 from 'argon2';

import { AiUsageService } from '@/infra/ai/ai-usage.service';
import { ChatToolDef, ToolCall } from '@/infra/ai/providers/llm-provider.interface';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PermCacheEvent } from '@/shared/constants/cache-key';
import { PermissionCode, PermissionCodeValue } from '@/shared/constants/permission-code';
import { PermissionCacheService } from '@/shared/services/permission-cache.service';
import { AuthUser } from '@/shared/types/auth-user';

export interface ToolContext {
  user: AuthUser;
  /** 用户权限码集合（超管为空集，执行时旁路） */
  perms: Set<string>;
}

export interface ToolExecResult {
  ok: boolean;
  data: unknown;
}

interface ToolSpec {
  def: ChatToolDef;
  /** 所需权限码（与 PermissionsGuard 同语义：超管旁路，其余必须命中） */
  permission?: PermissionCodeValue;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const DATA_SCOPE_TEXT: Record<string, string> = {
  ALL: '全部数据',
  DEPT_AND_CHILDREN: '本部门及以下',
  DEPT: '仅本部门',
  SELF: '仅本人',
  CUSTOM: '自定义部门',
};

/**
 * AI 工具注册表与执行器（Function Calling）：
 * - getTools() 下发给模型做意图决策
 * - execute() 带权限门控执行真实读写，失败以 {error} 结构回喂模型
 * - 写操作完成后发权限失效事件，保证「改权限不用重新登录」
 */
@Injectable()
export class AiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permCache: PermissionCacheService,
    private readonly usage: AiUsageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 构建工具执行上下文 */
  async buildContext(user: AuthUser): Promise<ToolContext> {
    const perms = user.isSuper
      ? new Set<string>()
      : await this.permCache.getUserPermCodes(user.userId);
    return { user, perms };
  }

  getTools(): ChatToolDef[] {
    return this.specs().map((s) => s.def);
  }

  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolExecResult> {
    const spec = this.specs().find((s) => s.def.function.name === call.name);
    if (!spec) return { ok: false, data: { error: `未知工具: ${call.name}` } };

    if (spec.permission && !ctx.user.isSuper && !ctx.perms.has(spec.permission)) {
      return {
        ok: false,
        data: { error: `权限不足，执行该操作需要 ${spec.permission} 权限` },
      };
    }

    let args: Record<string, unknown>;
    try {
      args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
    } catch {
      return { ok: false, data: { error: '工具参数不是合法 JSON' } };
    }

    try {
      return { ok: true, data: await spec.run(args, ctx) };
    } catch (error) {
      return {
        ok: false,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private specs(): ToolSpec[] {
    return [
      this.overviewSpec(),
      this.searchUsersSpec(),
      this.createUserSpec(),
      this.assignUserRolesSpec(),
      this.listRolesSpec(),
      this.getDeptTreeSpec(),
      this.listPermissionsSpec(),
      this.setRolePermissionsSpec(),
      this.getAiUsageSpec(),
    ];
  }

  // ==================== 读工具 ====================

  private overviewSpec(): ToolSpec {
    return {
      permission: PermissionCode.Dashboard,
      def: {
        type: 'function',
        function: {
          name: 'get_system_overview',
          description:
            '查询系统概览统计：用户/角色/权限点/部门数量、启用的供应商与模型数、今日 AI 调用次数。',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      run: async () => {
        const today = startOfToday();
        const [users, roles, permissions, departments, providers, models, callsToday] =
          await Promise.all([
            this.prisma.sysUser.count({ where: { deletedAt: null } }),
            this.prisma.sysRole.count(),
            this.prisma.sysPermission.count(),
            this.prisma.sysDept.count(),
            this.prisma.aiProvider.count({ where: { deletedAt: null, enabled: true } }),
            this.prisma.aiModel.count({
              where: { enabled: true, provider: { deletedAt: null, enabled: true } },
            }),
            this.prisma.aiCallLog.count({ where: { createdAt: { gte: today } } }),
          ]);
        return { users, roles, permissions, departments, providers, models, callsToday };
      },
    };
  }

  private searchUsersSpec(): ToolSpec {
    return {
      permission: PermissionCode.SystemUserList,
      def: {
        type: 'function',
        function: {
          name: 'search_users',
          description:
            '按关键词（用户名/昵称）分页搜索系统用户，返回用户名、昵称、部门、角色与状态。',
          parameters: {
            type: 'object',
            properties: {
              keyword: { type: 'string', description: '用户名或昵称包含的关键词，可省略' },
              page: { type: 'integer', minimum: 1, description: '页码，默认 1' },
              pageSize: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                description: '每页条数，默认 5，最大 20',
              },
            },
            required: [],
          },
        },
      },
      run: async (args) => {
        const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
        const page = Math.max(1, Number(args.page) || 1);
        const pageSize = Math.min(20, Math.max(1, Number(args.pageSize) || 5));
        const where = {
          deletedAt: null,
          ...(keyword
            ? { OR: [{ username: { contains: keyword } }, { nickname: { contains: keyword } }] }
            : {}),
        };
        const [total, rows] = await Promise.all([
          this.prisma.sysUser.count({ where }),
          this.prisma.sysUser.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              username: true,
              nickname: true,
              status: true,
              dept: { select: { name: true } },
              roles: { select: { role: { select: { code: true, name: true } } } },
            },
          }),
        ]);
        return {
          total,
          page,
          pageSize,
          list: rows.map((r) => ({
            username: r.username,
            nickname: r.nickname,
            status: r.status === Status.ENABLED ? '启用' : '禁用',
            dept: r.dept?.name ?? null,
            roles: r.roles.map((x) => `${x.role.name}(${x.role.code})`),
          })),
        };
      },
    };
  }

  private listRolesSpec(): ToolSpec {
    return {
      permission: PermissionCode.SystemRoleList,
      def: {
        type: 'function',
        function: {
          name: 'list_roles',
          description: '查询全部角色：编码、名称、数据权限范围，以及每个角色当前拥有的权限码列表。',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      run: async () => {
        const roles = await this.prisma.sysRole.findMany({
          select: {
            code: true,
            name: true,
            dataScope: true,
            status: true,
            perms: { select: { permission: { select: { code: true } } } },
          },
          orderBy: { sort: 'asc' },
        });
        return roles.map((r) => ({
          code: r.code,
          name: r.name,
          dataScope: DATA_SCOPE_TEXT[r.dataScope] ?? r.dataScope,
          enabled: r.status === Status.ENABLED,
          permissionCodes: r.perms.map((rp) => rp.permission.code),
        }));
      },
    };
  }

  private getDeptTreeSpec(): ToolSpec {
    return {
      permission: PermissionCode.SystemDeptList,
      def: {
        type: 'function',
        function: {
          name: 'get_dept_tree',
          description: '查询部门列表（含 ID 与父子关系），创建用户指定部门时先用它拿 deptId。',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      run: async () => {
        const depts = await this.prisma.sysDept.findMany({
          select: { id: true, name: true, parentId: true },
          orderBy: { sort: 'asc' },
        });
        return depts.map((d) => ({ id: d.id, name: d.name, parentId: d.parentId }));
      },
    };
  }

  private listPermissionsSpec(): ToolSpec {
    return {
      permission: PermissionCode.SystemPermissionList,
      def: {
        type: 'function',
        function: {
          name: 'list_permissions',
          description:
            '查询全部权限点（目录/菜单/按钮）的编码与名称，配置角色权限时用它取可用权限码。',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      run: async () => {
        const perms = await this.prisma.sysPermission.findMany({
          select: { code: true, name: true, type: true },
          orderBy: { sort: 'asc' },
        });
        return perms.map((p) => ({ code: p.code, name: p.name, type: p.type }));
      },
    };
  }

  private getAiUsageSpec(): ToolSpec {
    return {
      permission: PermissionCode.AiUsageList,
      def: {
        type: 'function',
        function: {
          name: 'get_ai_usage',
          description:
            '查询 AI 用量汇总（按厂商/模型分组）：调用次数、输入/输出/总 Tokens、估算成本。',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      run: async () => this.usage.summary(),
    };
  }

  // ==================== 写工具 ====================

  private createUserSpec(): ToolSpec {
    return {
      permission: PermissionCode.SystemUserCreate,
      def: {
        type: 'function',
        function: {
          name: 'create_user',
          description: '创建新用户（添加员工）。调用前必须已获得用户确认。返回用户 ID 与初始密码。',
          parameters: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_]{2,32}$',
                description: '登录账号：2-32 位字母/数字/下划线',
              },
              nickname: { type: 'string', description: '显示昵称，如：张三' },
              password: {
                type: 'string',
                description: '初始密码，6-64 位；省略则使用默认初始密码 Abc@12345',
              },
              deptId: {
                type: 'string',
                description: '部门 ID（可先用 get_dept_tree 查询），可省略',
              },
              roleCodes: {
                type: 'array',
                items: { type: 'string' },
                description: '角色编码列表，如 ["common"]，可省略',
              },
            },
            required: ['username', 'nickname'],
          },
        },
      },
      run: async (args, ctx) => {
        const username = String(args.username ?? '').trim();
        const nickname = String(args.nickname ?? '').trim();
        if (!/^[a-zA-Z0-9_]{2,32}$/.test(username)) {
          return { error: '用户名需为 2-32 位字母、数字或下划线' };
        }
        if (!nickname) return { error: '昵称不能为空' };
        const password =
          typeof args.password === 'string' && args.password.length >= 6
            ? args.password
            : 'Abc@12345';

        const exists = await this.prisma.sysUser.findFirst({ where: { username } });
        if (exists) return { error: `用户名 ${username} 已存在` };

        const deptId = typeof args.deptId === 'string' && args.deptId ? args.deptId : null;
        if (deptId) {
          const dept = await this.prisma.sysDept.findFirst({ where: { id: deptId } });
          if (!dept) return { error: `部门不存在: ${deptId}` };
        }

        const roleCodes = Array.isArray(args.roleCodes) ? args.roleCodes.map((c) => String(c)) : [];
        const roles = roleCodes.length
          ? await this.prisma.sysRole.findMany({ where: { code: { in: roleCodes } } })
          : [];
        const missing = roleCodes.filter((c) => !roles.some((r) => r.code === c));
        if (missing.length) return { error: `角色不存在: ${missing.join(', ')}` };

        const user = await this.prisma.$transaction(async (tx) => {
          const created = await tx.sysUser.create({
            data: {
              username,
              nickname,
              password: await argon2.hash(password),
              deptId,
              status: Status.ENABLED,
              createdBy: ctx.user.userId,
            },
          });
          if (roles.length) {
            await tx.sysUserRole.createMany({
              data: roles.map((r) => ({ userId: created.id, roleId: r.id })),
            });
          }
          return created;
        });

        return {
          userId: user.id,
          username,
          nickname,
          initialPassword: password,
          roles: roles.map((r) => r.code),
          note: '请把账号与初始密码告知用户，并建议登录后修改密码。',
        };
      },
    };
  }

  private assignUserRolesSpec(): ToolSpec {
    return {
      permission: PermissionCode.SystemUserAssignRoles,
      def: {
        type: 'function',
        function: {
          name: 'assign_user_roles',
          description: '为指定用户全量设置角色列表（覆盖式）。调用前必须已获得用户确认。',
          parameters: {
            type: 'object',
            properties: {
              username: { type: 'string', description: '目标用户登录名' },
              roleCodes: {
                type: 'array',
                items: { type: 'string' },
                description: '角色编码全量列表，如 ["common"]；空数组表示清空角色',
              },
            },
            required: ['username', 'roleCodes'],
          },
        },
      },
      run: async (args) => {
        const username = String(args.username ?? '').trim();
        const user = await this.prisma.sysUser.findFirst({
          where: { username, deletedAt: null },
        });
        if (!user) return { error: `用户不存在: ${username}` };

        const roleCodes = Array.isArray(args.roleCodes) ? args.roleCodes.map((c) => String(c)) : [];
        const roles = roleCodes.length
          ? await this.prisma.sysRole.findMany({ where: { code: { in: roleCodes } } })
          : [];
        const missing = roleCodes.filter((c) => !roles.some((r) => r.code === c));
        if (missing.length) return { error: `角色不存在: ${missing.join(', ')}` };

        await this.prisma.$transaction([
          this.prisma.sysUserRole.deleteMany({ where: { userId: user.id } }),
          this.prisma.sysUserRole.createMany({
            data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
          }),
        ]);
        // 权限即时生效（无需重新登录）
        this.eventEmitter.emit(PermCacheEvent.invalidateUser, { userId: user.id });
        return { username, roles: roleCodes };
      },
    };
  }

  private setRolePermissionsSpec(): ToolSpec {
    return {
      permission: PermissionCode.SystemRoleAssignPerms,
      def: {
        type: 'function',
        function: {
          name: 'set_role_permissions',
          description:
            '为指定角色全量设置权限码集合（覆盖式，先用 list_roles 查当前集合、list_permissions 查可选码）。调用前必须已获得用户确认。',
          parameters: {
            type: 'object',
            properties: {
              roleCode: { type: 'string', description: '角色编码，如 common' },
              permissionCodes: {
                type: 'array',
                items: { type: 'string' },
                description: '权限码全量列表',
              },
            },
            required: ['roleCode', 'permissionCodes'],
          },
        },
      },
      run: async (args) => {
        const roleCode = String(args.roleCode ?? '').trim();
        const role = await this.prisma.sysRole.findFirst({ where: { code: roleCode } });
        if (!role) return { error: `角色不存在: ${roleCode}` };

        const codes = Array.isArray(args.permissionCodes)
          ? args.permissionCodes.map((c) => String(c))
          : [];
        const perms = codes.length
          ? await this.prisma.sysPermission.findMany({ where: { code: { in: codes } } })
          : [];
        const missing = codes.filter((c) => !perms.some((p) => p.code === c));
        if (missing.length) return { error: `权限码不存在: ${missing.join(', ')}` };

        await this.prisma.$transaction([
          this.prisma.sysRolePermission.deleteMany({ where: { roleId: role.id } }),
          this.prisma.sysRolePermission.createMany({
            data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
          }),
        ]);
        this.eventEmitter.emit(PermCacheEvent.invalidateRole, { roleId: role.id });
        return { role: roleCode, granted: codes.length };
      },
    };
  }
}
