/**
 * API 类型定义
 *
 * 与后端（nest-backend）接口结构一一对应：
 * - 统一响应 { code, message, data } 已由 http 层拆包，此处只声明 data 形状
 * - 分页响应统一为 { list, total, page, pageSize }
 * - 分页入参统一为 { page, pageSize }
 */

declare namespace Api {
  /** 通用类型 */
  namespace Common {
    /** 分页参数（与后端 PaginationDto 对应；current/size 为 useTable 内部状态字段名） */
    interface PaginationParams {
      page?: number
      pageSize?: number
      total?: number
      current?: number
      size?: number
    }

    type CommonSearchParams = Pick<PaginationParams, 'page' | 'pageSize'>

    /** 分页响应（与后端 PageResult 对应） */
    interface PaginatedResponse<T = any> {
      list: T[]
      total: number
      page: number
      pageSize: number
    }

    /** 启用状态（与后端 Status 枚举对应） */
    type EnableStatus = 'ENABLED' | 'DISABLED'
  }

  /** 认证 */
  namespace Auth {
    /** 登录参数 */
    interface LoginParams {
      username: string
      password: string
    }

    /** 登录响应 */
    interface LoginResponse {
      accessToken: string
      refreshToken: string
      expiresIn: number
    }

    /** 权限菜单节点（后端下发，DIR/MENU 两类） */
    interface MenuNode {
      id: string
      parentId: string | null
      name: string
      code: string
      type: 'DIR' | 'MENU'
      path: string | null
      icon: string | null
      sort: number
      children: MenuNode[]
    }

    /** 用户信息（GET /auth/profile 返回） */
    interface UserInfo {
      /** 权限码集合（按钮级权限依据，如 system:user:create） */
      permissions: string[]
      /** 角色编码集合 */
      roles: string[]
      /** 菜单树（动态路由依据） */
      menus: MenuNode[]
      userId: string
      userName: string
      nickName: string
      email?: string
      phone?: string
      avatar?: string
      deptId?: string | null
      isSuper?: boolean
    }
  }

  /** 系统管理 */
  namespace SystemManage {
    /** 用户列表 */
    type UserList = Api.Common.PaginatedResponse<UserListItem>

    /** 用户列表项（与后端 UserResponseDto 对应） */
    interface UserListItem {
      id: string
      username: string
      nickname: string
      email: string | null
      phone: string | null
      deptId: string | null
      deptName: string | null
      status: Api.Common.EnableStatus
      isSuper: boolean
      roles: string[]
      createdAt: string
    }

    type UserSearchParams = Partial<
      Pick<UserListItem, 'status' | 'deptId'> & { keyword: string } & Api.Common.CommonSearchParams
    >

    /** 角色列表 */
    type RoleList = Api.Common.PaginatedResponse<RoleListItem>

    /** 角色（与后端 RoleResponseDto 对应） */
    interface RoleListItem {
      id: string
      code: string
      name: string
      dataScope: 'ALL' | 'DEPT_AND_CHILDREN' | 'DEPT' | 'SELF' | 'CUSTOM'
      status: Api.Common.EnableStatus
      sort: number
      remark: string | null
      permissionIds: string[]
      deptIds: string[]
      createdAt: string
    }

    type RoleSearchParams = Partial<
      Pick<RoleListItem, 'status'> & { keyword: string } & Api.Common.CommonSearchParams
    >

    /** 权限点（目录/菜单/按钮/接口） */
    interface PermissionItem {
      id: string
      parentId: string | null
      name: string
      code: string
      type: 'DIR' | 'MENU' | 'BUTTON' | 'API'
      path: string | null
      icon: string | null
      sort: number
      status: Api.Common.EnableStatus
      children?: PermissionItem[]
    }

    /** 部门节点 */
    interface DeptItem {
      id: string
      parentId: string | null
      name: string
      sort: number
      status: Api.Common.EnableStatus
      createdAt: string
      children?: DeptItem[]
    }

    /** AI 用量汇总项 */
    interface AiUsageItem {
      provider: string
      model: string
      calls: number
      promptTokens: number
      completionTokens: number
      totalTokens: number
      costEstimate: number | null
    }
  }

  /** 站内通知（真实接口） */
  namespace Notify {
    type NotifyType = 'NOTICE' | 'MESSAGE' | 'TODO'

    interface NotificationItem {
      id: string
      type: NotifyType
      title: string
      content: string | null
      link: string | null
      read: boolean
      createdAt: string
    }

    interface ListResponse {
      list: NotificationItem[]
      counts: Record<NotifyType, number>
      totalUnread: number
    }
  }

  /** 工作台（真实数据聚合） */
  namespace Dashboard {
    interface Stats {
      system: {
        users: number
        roles: number
        permissions: number
        departments: number
      }
      ai: {
        providers: number
        models: number
        defaultModel: string | null
        callsToday: number
        tokensToday: number
        costToday: number
        errorsToday: number
        avgLatencyToday: number | null
        callsTotal: number
        tokensTotal: number
      }
    }

    interface TrendPoint {
      date: string
      calls: number
      tokens: number
      cost: number
    }

    interface RecentCall {
      id: string
      provider: string
      model: string
      status: string
      latencyMs: number
      totalTokens: number
      costEstimate: number | null
      errorMsg: string | null
      createdAt: string
    }
  }

  /** AI 模型配置（供应商/模型，参考 CC Switch） */
  namespace AiConfig {
    /** 上游协议格式（与后端 AiProtocol 对应） */
    type Protocol = 'OPENAI_COMPAT' | 'OLLAMA'

    /** 供应商下的模型配置 */
    interface ModelItem {
      id?: string
      name: string
      label?: string | null
      maxOutput?: number | null
      contextWindow?: number | null
      enabled?: boolean
      isDefault?: boolean
      sort?: number
    }

    /** 供应商配置（列表返回时 apiKey 为掩码） */
    interface ProviderItem {
      id: string
      name: string
      protocol: Protocol
      baseUrl: string
      apiKey: string | null
      remark: string | null
      enabled: boolean
      sort: number
      createdAt?: string
      updatedAt?: string
      models: ModelItem[]
    }

    /** 新增/修改供应商入参（models 传入则整体替换；apiKey 缺省保留原值） */
    interface ProviderPayload {
      name: string
      protocol: Protocol
      baseUrl: string
      apiKey?: string
      remark?: string
      enabled?: boolean
      sort?: number
      models?: ModelItem[]
    }

    /** 对话页模型选择器项 */
    interface ChatModelItem {
      id: string
      name: string
      label: string
      providerName: string
      maxOutput: number | null
      contextWindow: number | null
      isDefault: boolean
    }

    /** GET /ai/models 响应 */
    interface ChatModelsResponse {
      defaultModelId: string | null
      list: ChatModelItem[]
    }
  }

  /** SaaS 多租户（租户运营 + 访客会话） */
  namespace Saas {
    /** 租户列表项（与后端 TenantView 对应） */
    interface TenantItem {
      id: string
      name: string
      code: string
      contactName: string | null
      contactEmail: string | null
      status: Api.Common.EnableStatus
      remark: string | null
      conversationCount: number
      apiKeyCount: number
      createdAt: string
      updatedAt: string
    }

    type TenantList = Api.Common.PaginatedResponse<TenantItem>

    type TenantSearchParams = Partial<
      Pick<TenantItem, 'status'> & { keyword: string } & Api.Common.CommonSearchParams
    >

    /** API Key 列表项（明文只在创建响应中出现一次） */
    interface ApiKeyItem {
      id: string
      tenantId: string
      name: string
      keyPrefix: string
      status: Api.Common.EnableStatus
      lastUsedAt: string | null
      createdAt: string
      /** 明文 Key，仅创建接口返回 */
      plaintext?: string
    }

    /** 会话列表项（与后端 ConversationView 对应） */
    interface ConversationItem {
      id: string
      tenantId: string
      tenantName: string | null
      visitorId: string
      title: string | null
      status: 'OPEN' | 'CLOSED'
      messageCount: number
      createdAt: string
      updatedAt: string
    }

    type ConversationList = Api.Common.PaginatedResponse<ConversationItem>

    type ConversationSearchParams = Partial<
      Pick<ConversationItem, 'tenantId' | 'visitorId' | 'status'> & Api.Common.CommonSearchParams
    >

    /** 会话消息 */
    interface ConversationMessage {
      id: string
      role: string
      content: string
      model: string | null
      promptTokens: number
      completionTokens: number
      createdAt: string
    }

    /** 会话详情（含全部消息） */
    interface ConversationDetail extends ConversationItem {
      messages: ConversationMessage[]
    }

    // ==================== 知识库 ====================

    type KbStatus = 'ENABLED' | 'DISABLED'
    type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

    /** 知识库列表项 */
    interface KbItem {
      id: string
      tenantId: string
      tenantName: string | null
      name: string
      description: string | null
      sort: number
      status: KbStatus
      articleCount: number
      publishedCount: number
      createdAt: string
      updatedAt: string
    }

    type KbList = Api.Common.PaginatedResponse<KbItem>

    type KbSearchParams = Partial<
      Pick<KbItem, 'tenantId'> & { keyword: string } & Api.Common.CommonSearchParams
    >

    /** 文章标签 */
    interface ArticleTag {
      id: string
      name: string
    }

    /** 文章列表项 */
    interface ArticleItem {
      id: string
      kbId: string
      tenantId: string
      title: string
      slug: string
      status: ArticleStatus
      seoTitle: string | null
      seoDescription: string | null
      publishedAt: string | null
      viewCount: number
      tags: ArticleTag[]
      createdAt: string
      updatedAt: string
    }

    type ArticleList = Api.Common.PaginatedResponse<ArticleItem>

    type ArticleSearchParams = Partial<
      Pick<ArticleItem, 'status'> & {
        keyword: string
        tagId: string
      } & Api.Common.CommonSearchParams
    >

    /** 文章详情（含正文） */
    interface ArticleDetail extends ArticleItem {
      content: string
    }

    /** 文章新增/修改入参 */
    interface ArticlePayload {
      title: string
      slug: string
      content: string
      status?: ArticleStatus
      seoTitle?: string
      seoDescription?: string
      tagIds?: string[]
    }

    /** 标签 */
    interface KbTag {
      id: string
      name: string
      articleCount: number
    }
  }
}
